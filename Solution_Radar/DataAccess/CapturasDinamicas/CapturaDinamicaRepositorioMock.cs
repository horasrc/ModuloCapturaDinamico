using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Web.Script.Serialization;
using Solution_Radar.Models.ModuloDinamico;

namespace Solution_Radar.DataAccess.CapturasDinamicas
{
    /// <summary>
    /// Implementación EN MEMORIA (datos mock) del repositorio.
    /// Sirve para demostrar el módulo completo sin base de datos.
    /// Los datos viven mientras el sitio esté arriba (se pierden al reiniciar IIS).
    ///
    /// Para producción: crea CapturaDinamicaRepositorioSql : ICapturaDinamicaRepositorio
    /// y respeta las mismas reglas de negocio (versionado, una respuesta por usuario, etc.).
    /// </summary>
    public class CapturaDinamicaRepositorioMock : ICapturaDinamicaRepositorio
    {
        // ------------------------------------------------------------------
        //  "Tablas" en memoria
        // ------------------------------------------------------------------
        private class EncuestaAlmacen
        {
            public int IdEncuesta;
            public string Nombre;
            public string Descripcion;
            public string FechaModificacion;
            public string UsuarioModifica;
            public List<EncuestaEditor> Versiones = new List<EncuestaEditor>();
        }

        private static readonly object _lock = new object();
        private static List<EncuestaAlmacen> _encuestas;
        private static List<RespuestaEncuesta> _respuestas;
        private static int _seqEncuesta;
        private static int _seqVersion;
        private static int _seqRespuesta;

        public CapturaDinamicaRepositorioMock()
        {
            lock (_lock)
            {
                if (_encuestas == null)
                {
                    InicializarDatosMock();
                }
            }
        }

        /// <summary>
        /// Copia de los datos de ejemplo (encuestas, versiones y respuestas).
        /// La usa CapturaDinamicaRepositorioSql para sembrar una base de datos vacía de pruebas.
        /// </summary>
        public static List<SemillaEncuesta> DatosSemilla()
        {
            lock (_lock)
            {
                if (_encuestas == null) { InicializarDatosMock(); }
                var lista = new List<SemillaEncuesta>();
                foreach (var a in _encuestas.OrderBy(x => x.IdEncuesta))
                {
                    var s = new SemillaEncuesta();
                    s.Nombre = a.Nombre;
                    s.Descripcion = a.Descripcion;
                    s.UsuarioModifica = a.UsuarioModifica;
                    s.Versiones = a.Versiones.OrderBy(v => v.NumeroVersion).Select(v => Clonar(v)).ToList();
                    var ids = new HashSet<int>(a.Versiones.Select(v => v.IdVersion));
                    s.Respuestas = _respuestas.Where(r => ids.Contains(r.IdVersion)).Select(r => Clonar(r)).ToList();
                    lista.Add(s);
                }
                return lista;
            }
        }

        // ==================================================================
        //  CONSULTAS
        // ==================================================================

        public List<EncuestaResumen> ListarEncuestas()
        {
            lock (_lock)
            {
                var lista = new List<EncuestaResumen>();
                foreach (var a in _encuestas.OrderByDescending(x => x.IdEncuesta))
                {
                    var vigente = VersionVigente(a);
                    var ultima = a.Versiones.OrderByDescending(v => v.NumeroVersion).First();
                    lista.Add(new EncuestaResumen
                    {
                        IdEncuesta = a.IdEncuesta,
                        Nombre = a.Nombre,
                        Descripcion = a.Descripcion,
                        Estatus = vigente.Estatus,
                        IdVersionVigente = vigente.IdVersion,
                        NumeroVersionVigente = vigente.NumeroVersion,
                        NumeroVersionUltima = ultima.NumeroVersion,
                        EstatusUltimaVersion = ultima.Estatus,
                        TotalPreguntas = ultima.Preguntas.Count,
                        TotalRespuestas = _respuestas.Count(r => r.IdEncuesta == a.IdEncuesta),
                        FechaInicio = vigente.Publicacion.FechaInicio,
                        FechaCierre = vigente.Publicacion.FechaCierre,
                        FechaModificacion = a.FechaModificacion,
                        UsuarioModifica = a.UsuarioModifica
                    });
                }
                return lista;
            }
        }

        public EncuestaEditor ObtenerEncuesta(int idEncuesta, int? idVersion)
        {
            lock (_lock)
            {
                var a = BuscarEncuesta(idEncuesta);
                if (a == null) { return null; }

                EncuestaEditor v = idVersion.HasValue
                    ? a.Versiones.FirstOrDefault(x => x.IdVersion == idVersion.Value)
                    : a.Versiones.OrderByDescending(x => x.NumeroVersion).First();
                if (v == null) { return null; }

                return ArmarEncuesta(a, v);
            }
        }

        public ResultadosEncuesta ObtenerResultados(int idEncuesta, int? idVersion)
        {
            lock (_lock)
            {
                var a = BuscarEncuesta(idEncuesta);
                if (a == null) { return null; }

                var conRespuestas = a.Versiones
                    .Where(v => _respuestas.Any(r => r.IdVersion == v.IdVersion))
                    .OrderByDescending(v => v.NumeroVersion)
                    .ToList();

                EncuestaEditor def = null;
                if (idVersion.HasValue) { def = a.Versiones.FirstOrDefault(v => v.IdVersion == idVersion.Value); }
                if (def == null && conRespuestas.Count > 0) { def = conRespuestas[0]; }
                if (def == null) { def = VersionVigente(a); }

                var copia = Clonar(def);
                copia.Nombre = a.Nombre;
                var resp = _respuestas.Where(r => r.IdVersion == def.IdVersion).ToList();

                var resultados = CapturaDinamicaResultadosServicio.Calcular(copia, resp);
                foreach (var v in conRespuestas)
                {
                    resultados.VersionesConRespuestas.Add(ResumenVersion(v));
                }
                return resultados;
            }
        }

        public CapturaInfo ObtenerCaptura(int idEncuesta, UsuarioToken usuario)
        {
            lock (_lock)
            {
                var info = new CapturaInfo();
                var a = BuscarEncuesta(idEncuesta);
                if (a == null)
                {
                    info.Mensaje = "La encuesta no existe.";
                    return info;
                }

                var publicada = a.Versiones.FirstOrDefault(v => v.Estatus == CatalogoCapturaDinamica.EstatusPublicada);
                if (publicada == null)
                {
                    info.Mensaje = "Esta encuesta no se encuentra publicada en este momento.";
                    return info;
                }

                string hoy = CapturaDinamicaResultadosServicio.Hoy();
                var pub = publicada.Publicacion;
                if (!string.IsNullOrEmpty(pub.FechaInicio) && string.CompareOrdinal(hoy, pub.FechaInicio) < 0)
                {
                    info.Mensaje = "La encuesta estará disponible a partir del " + FormatoFecha(pub.FechaInicio) + ".";
                    return info;
                }
                if (!string.IsNullOrEmpty(pub.FechaCierre) && string.CompareOrdinal(hoy, pub.FechaCierre) > 0)
                {
                    info.Mensaje = "La encuesta cerró el " + FormatoFecha(pub.FechaCierre) + ".";
                    return info;
                }

                if (pub.RespuestaUnica && UsuarioYaRespondio(publicada.IdVersion, usuario))
                {
                    info.Mensaje = "Ya registraste tu respuesta a esta encuesta. ¡Gracias!";
                    return info;
                }

                // TODO BD: validar aquí la SEGMENTACIÓN (publicada.Segmentacion) contra los datos
                // del empleado (puesto, región, sucursal...) para decidir si puede responder.

                info.PuedeResponder = true;
                info.Encuesta = ArmarEncuesta(a, publicada);
                return info;
            }
        }

        // ==================================================================
        //  OPERACIONES
        // ==================================================================

        public EncuestaEditor CrearEncuesta(string nombre, string descripcion, UsuarioToken usuario)
        {
            lock (_lock)
            {
                var a = new EncuestaAlmacen();
                a.IdEncuesta = ++_seqEncuesta;
                a.Nombre = string.IsNullOrWhiteSpace(nombre) ? "Nueva encuesta" : nombre.Trim();
                a.Descripcion = descripcion;
                a.FechaModificacion = Ahora();
                a.UsuarioModifica = NombreUsuario(usuario);

                var v = new EncuestaEditor();
                v.IdEncuesta = a.IdEncuesta;
                v.IdVersion = ++_seqVersion;
                v.NumeroVersion = 1;
                v.Nombre = a.Nombre;
                v.Descripcion = descripcion;
                v.Estatus = CatalogoCapturaDinamica.EstatusBorrador;
                v.FechaCreacion = CapturaDinamicaResultadosServicio.Hoy();
                v.UsuarioCrea = NombreUsuario(usuario);
                v.PoblacionObjetivo = 0;
                v.Publicacion = new PublicacionConfig
                {
                    FechaInicio = CapturaDinamicaResultadosServicio.Hoy(),
                    FechaCierre = DateTime.Today.AddDays(30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    RespuestaUnica = true,
                    Anonima = false,
                    RequiereAutenticacion = true,
                    MensajeInicial = "",
                    MensajeFinal = "¡Gracias por tu respuesta!"
                };
                a.Versiones.Add(v);
                _encuestas.Add(a);
                return ArmarEncuesta(a, v);
            }
        }

        public ResultadoOperacion GuardarBorrador(EncuestaEditor encuesta, UsuarioToken usuario)
        {
            lock (_lock)
            {
                string mensaje;
                var guardada = GuardarInterno(encuesta, usuario, out mensaje);
                if (guardada == null) { return ResultadoOperacion.Error(mensaje); }
                var a = BuscarEncuesta(encuesta.IdEncuesta);
                return ResultadoOperacion.Ok(ArmarEncuesta(a, guardada), mensaje);
            }
        }

        public ResultadoOperacion Publicar(EncuestaEditor encuesta, UsuarioToken usuario)
        {
            lock (_lock)
            {
                string error = ValidarParaPublicar(encuesta);
                if (error != null) { return ResultadoOperacion.Error(error); }

                string mensaje;
                var guardada = GuardarInterno(encuesta, usuario, out mensaje);
                if (guardada == null) { return ResultadoOperacion.Error(mensaje); }

                var a = BuscarEncuesta(encuesta.IdEncuesta);
                // La versión publicada anterior se conserva como histórico (Archivada)
                foreach (var v in a.Versiones)
                {
                    if (v.IdVersion != guardada.IdVersion && v.Estatus == CatalogoCapturaDinamica.EstatusPublicada)
                    {
                        v.Estatus = CatalogoCapturaDinamica.EstatusArchivada;
                    }
                }
                guardada.Estatus = CatalogoCapturaDinamica.EstatusPublicada;
                guardada.FechaPublicacion = CapturaDinamicaResultadosServicio.Hoy();

                return ResultadoOperacion.Ok(ArmarEncuesta(a, guardada),
                    "Versión " + guardada.NumeroVersion + " publicada correctamente.");
            }
        }

        public ResultadoOperacion CambiarEstatus(int idEncuesta, string estatus, UsuarioToken usuario)
        {
            lock (_lock)
            {
                var a = BuscarEncuesta(idEncuesta);
                if (a == null) { return ResultadoOperacion.Error("La encuesta no existe."); }

                var vigente = VersionVigente(a);
                if (estatus == CatalogoCapturaDinamica.EstatusCerrada)
                {
                    if (vigente.Estatus != CatalogoCapturaDinamica.EstatusPublicada)
                    {
                        return ResultadoOperacion.Error("Solo se puede cerrar una encuesta publicada.");
                    }
                }
                else if (estatus == CatalogoCapturaDinamica.EstatusPublicada)
                {
                    if (vigente.Estatus != CatalogoCapturaDinamica.EstatusCerrada)
                    {
                        return ResultadoOperacion.Error("Solo se puede reabrir una encuesta cerrada.");
                    }
                }
                else if (estatus != CatalogoCapturaDinamica.EstatusArchivada)
                {
                    return ResultadoOperacion.Error("Estatus no válido.");
                }

                vigente.Estatus = estatus;
                a.FechaModificacion = Ahora();
                a.UsuarioModifica = NombreUsuario(usuario);
                return ResultadoOperacion.Ok(ArmarEncuesta(a, vigente), "La encuesta ahora está " + estatus.ToLower() + ".");
            }
        }

        public ResultadoOperacion GuardarRespuesta(RespuestaEncuesta respuesta, UsuarioToken usuario)
        {
            lock (_lock)
            {
                var a = BuscarEncuesta(respuesta.IdEncuesta);
                if (a == null) { return ResultadoOperacion.Error("La encuesta no existe."); }

                var version = a.Versiones.FirstOrDefault(v => v.IdVersion == respuesta.IdVersion);
                if (version == null || version.Estatus != CatalogoCapturaDinamica.EstatusPublicada)
                {
                    return ResultadoOperacion.Error("La encuesta ya no está disponible para responder.");
                }
                if (version.Publicacion.RespuestaUnica && UsuarioYaRespondio(version.IdVersion, usuario))
                {
                    return ResultadoOperacion.Error("Ya registraste tu respuesta a esta encuesta.");
                }
                if (respuesta.Respuestas == null || respuesta.Respuestas.Count == 0)
                {
                    return ResultadoOperacion.Error("No se recibieron respuestas.");
                }

                // Validación de obligatorias en servidor (la visibilidad condicional se valida en cliente)
                var claves = new HashSet<string>(respuesta.Respuestas.Select(r => r.ClavePregunta));
                var preguntasValidas = new HashSet<string>(version.Preguntas.Select(p => p.Clave));
                respuesta.Respuestas = respuesta.Respuestas.Where(r => preguntasValidas.Contains(r.ClavePregunta)).ToList();
                if (!claves.Any(c => preguntasValidas.Contains(c)))
                {
                    return ResultadoOperacion.Error("Las respuestas no corresponden a la versión de la encuesta.");
                }

                respuesta.IdRespuesta = ++_seqRespuesta;
                respuesta.NumEmpleado = usuario != null ? usuario.NumEmpleado : null;
                respuesta.NombreEmpleado = NombreUsuario(usuario);
                respuesta.FechaRespuesta = Ahora();
                _respuestas.Add(respuesta);

                return ResultadoOperacion.Ok(respuesta.IdRespuesta, version.Publicacion.MensajeFinal);
            }
        }

        // ==================================================================
        //  REGLAS DE NEGOCIO INTERNAS
        // ==================================================================

        /// <summary>
        /// Aplica la regla de versionado y guarda. Regresa la versión resultante.
        /// </summary>
        private EncuestaEditor GuardarInterno(EncuestaEditor e, UsuarioToken usuario, out string mensaje)
        {
            var a = BuscarEncuesta(e.IdEncuesta);
            if (a == null) { mensaje = "La encuesta no existe."; return null; }

            var actual = a.Versiones.FirstOrDefault(v => v.IdVersion == e.IdVersion);
            if (actual == null) { mensaje = "La versión no existe."; return null; }

            NormalizarOrden(e);
            a.Nombre = string.IsNullOrWhiteSpace(e.Nombre) ? a.Nombre : e.Nombre.Trim();
            a.Descripcion = e.Descripcion;
            a.FechaModificacion = Ahora();
            a.UsuarioModifica = NombreUsuario(usuario);

            int respuestas = _respuestas.Count(r => r.IdVersion == actual.IdVersion);
            bool protegida = actual.Estatus != CatalogoCapturaDinamica.EstatusBorrador &&
                             (respuestas > 0 ||
                              actual.Estatus == CatalogoCapturaDinamica.EstatusCerrada ||
                              actual.Estatus == CatalogoCapturaDinamica.EstatusArchivada);

            if (!protegida)
            {
                // Se sobrescribe la misma versión (borrador o publicada sin respuestas)
                var copia = Clonar(e);
                copia.Estatus = actual.Estatus;
                copia.NumeroVersion = actual.NumeroVersion;
                copia.FechaCreacion = actual.FechaCreacion;
                copia.FechaPublicacion = actual.FechaPublicacion;
                copia.UsuarioCrea = actual.UsuarioCrea;
                copia.Versiones = new List<VersionResumen>();
                a.Versiones[a.Versiones.IndexOf(actual)] = copia;
                mensaje = "Versión " + copia.NumeroVersion + " guardada.";
                return copia;
            }

            // La versión tiene respuestas: NO se sobrescribe.
            // Si ya existe un borrador se actualiza ese; si no, se crea una versión nueva.
            var borrador = a.Versiones.FirstOrDefault(v => v.Estatus == CatalogoCapturaDinamica.EstatusBorrador);
            var nueva = Clonar(e);
            nueva.Estatus = CatalogoCapturaDinamica.EstatusBorrador;
            nueva.FechaPublicacion = null;
            nueva.Versiones = new List<VersionResumen>();
            if (borrador != null)
            {
                nueva.IdVersion = borrador.IdVersion;
                nueva.NumeroVersion = borrador.NumeroVersion;
                nueva.FechaCreacion = borrador.FechaCreacion;
                nueva.UsuarioCrea = borrador.UsuarioCrea;
                a.Versiones[a.Versiones.IndexOf(borrador)] = nueva;
                mensaje = "La versión " + actual.NumeroVersion + " ya tiene respuestas; los cambios se guardaron en la versión " +
                          nueva.NumeroVersion + " (borrador).";
            }
            else
            {
                nueva.IdVersion = ++_seqVersion;
                nueva.NumeroVersion = a.Versiones.Max(v => v.NumeroVersion) + 1;
                nueva.FechaCreacion = CapturaDinamicaResultadosServicio.Hoy();
                nueva.UsuarioCrea = NombreUsuario(usuario);
                a.Versiones.Add(nueva);
                mensaje = "La versión " + actual.NumeroVersion + " ya tiene respuestas; se creó la versión " +
                          nueva.NumeroVersion + " (borrador) y se conservó el histórico.";
            }
            return nueva;
        }

        private static string ValidarParaPublicar(EncuestaEditor e)
        {
            if (e.Preguntas == null || e.Preguntas.Count == 0) { return "Agrega al menos una pregunta antes de publicar."; }
            for (int i = 0; i < e.Preguntas.Count; i++)
            {
                if (string.IsNullOrWhiteSpace(e.Preguntas[i].Texto))
                {
                    return "La pregunta " + (i + 1) + " no tiene texto.";
                }
            }
            var p = e.Publicacion;
            if (p != null && !string.IsNullOrEmpty(p.FechaInicio) && !string.IsNullOrEmpty(p.FechaCierre) &&
                string.CompareOrdinal(p.FechaInicio, p.FechaCierre) > 0)
            {
                return "La fecha de cierre debe ser posterior a la fecha de inicio.";
            }
            return null;
        }

        private static void NormalizarOrden(EncuestaEditor e)
        {
            if (e.Preguntas == null) { e.Preguntas = new List<Pregunta>(); }
            for (int i = 0; i < e.Preguntas.Count; i++) { e.Preguntas[i].Orden = i + 1; }
            if (e.Publicacion == null) { e.Publicacion = new PublicacionConfig(); }
            if (e.Segmentacion == null) { e.Segmentacion = new List<SegmentoRegla>(); }
        }

        private EncuestaEditor ArmarEncuesta(EncuestaAlmacen a, EncuestaEditor v)
        {
            var copia = Clonar(v);
            copia.Nombre = a.Nombre;
            copia.Descripcion = a.Descripcion;
            copia.TotalRespuestas = _respuestas.Count(r => r.IdVersion == v.IdVersion);
            copia.Versiones = a.Versiones.OrderByDescending(x => x.NumeroVersion).Select(ResumenVersion).ToList();
            return copia;
        }

        private VersionResumen ResumenVersion(EncuestaEditor v)
        {
            return new VersionResumen
            {
                IdVersion = v.IdVersion,
                NumeroVersion = v.NumeroVersion,
                Estatus = v.Estatus,
                FechaCreacion = v.FechaCreacion,
                FechaPublicacion = v.FechaPublicacion,
                UsuarioCrea = v.UsuarioCrea,
                TotalRespuestas = _respuestas.Count(r => r.IdVersion == v.IdVersion)
            };
        }

        /// <summary>Versión vigente = la publicada; si no hay, la cerrada más reciente; si no, la última.</summary>
        private static EncuestaEditor VersionVigente(EncuestaAlmacen a)
        {
            var pub = a.Versiones.FirstOrDefault(v => v.Estatus == CatalogoCapturaDinamica.EstatusPublicada);
            if (pub != null) { return pub; }
            var cerrada = a.Versiones.Where(v => v.Estatus == CatalogoCapturaDinamica.EstatusCerrada)
                                     .OrderByDescending(v => v.NumeroVersion).FirstOrDefault();
            if (cerrada != null) { return cerrada; }
            return a.Versiones.OrderByDescending(v => v.NumeroVersion).First();
        }

        private static bool UsuarioYaRespondio(int idVersion, UsuarioToken usuario)
        {
            if (usuario == null || string.IsNullOrEmpty(usuario.NumEmpleado)) { return false; }
            return _respuestas.Any(r => r.IdVersion == idVersion && r.NumEmpleado == usuario.NumEmpleado);
        }

        private static EncuestaAlmacen BuscarEncuesta(int id)
        {
            return _encuestas.FirstOrDefault(x => x.IdEncuesta == id);
        }

        private static string NombreUsuario(UsuarioToken u)
        {
            return u == null || string.IsNullOrEmpty(u.NombreEmpleado) ? "Sistema" : u.NombreEmpleado;
        }

        private static string Ahora()
        {
            return DateTime.Now.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        }

        private static string FormatoFecha(string yyyyMMdd)
        {
            DateTime f;
            if (DateTime.TryParseExact(yyyyMMdd, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out f))
            {
                return f.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
            }
            return yyyyMMdd;
        }

        /// <summary>Copia profunda (evita que el cliente modifique los objetos guardados).</summary>
        private static T Clonar<T>(T obj)
        {
            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            return js.Deserialize<T>(js.Serialize(obj));
        }

        private static string Fecha(int diasDesdeHoy)
        {
            return DateTime.Today.AddDays(diasDesdeHoy).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        // ==================================================================
        //  DATOS MOCK
        // ==================================================================

        private static void InicializarDatosMock()
        {
            _encuestas = new List<EncuestaAlmacen>();
            _respuestas = new List<RespuestaEncuesta>();
            _seqEncuesta = 0;
            _seqVersion = 0;
            _seqRespuesta = 0;

            // ---------- Encuesta 1: publicada con respuestas (demuestra versionado) ----------
            var e1 = new EncuestaAlmacen
            {
                IdEncuesta = ++_seqEncuesta,
                Nombre = "Experiencia con campañas comerciales",
                Descripcion = "Retroalimentación de ejecutivos sobre el material de la campaña.",
                FechaModificacion = Fecha(-6) + " 10:15",
                UsuarioModifica = "Administrador Portal"
            };
            var v1 = new EncuestaEditor
            {
                IdEncuesta = e1.IdEncuesta,
                IdVersion = ++_seqVersion,
                NumeroVersion = 1,
                Nombre = e1.Nombre,
                Estatus = CatalogoCapturaDinamica.EstatusPublicada,
                FechaCreacion = Fecha(-8),
                FechaPublicacion = Fecha(-6),
                UsuarioCrea = "Administrador Portal",
                PoblacionObjetivo = 120,
                Publicacion = new PublicacionConfig
                {
                    FechaInicio = Fecha(-6),
                    FechaCierre = Fecha(24),
                    RespuestaUnica = true,
                    Anonima = true,
                    RequiereAutenticacion = true,
                    MensajeInicial = "Queremos conocer tu experiencia con el material de la campaña. Te tomará menos de 5 minutos.",
                    MensajeFinal = "¡Gracias por tu respuesta! Tus comentarios nos ayudan a mejorar las próximas campañas."
                }
            };
            v1.Segmentacion.Add(new SegmentoRegla { Clave = "s1", Tipo = "Puesto", Valor = "Ejecutivos" });
            v1.Segmentacion.Add(new SegmentoRegla { Clave = "s2", Tipo = "Region", Valor = "Centro" });
            v1.Preguntas = PreguntasEncuestaCampanas();
            e1.Versiones.Add(v1);
            _encuestas.Add(e1);
            GenerarRespuestas(e1.IdEncuesta, v1, 42, 2026);

            // ---------- Encuesta 2: borrador ----------
            var e2 = new EncuestaAlmacen
            {
                IdEncuesta = ++_seqEncuesta,
                Nombre = "Clima laboral 4T",
                Descripcion = "Pulso trimestral de clima laboral en sucursales.",
                FechaModificacion = Fecha(-1) + " 17:40",
                UsuarioModifica = "Administrador Portal"
            };
            var v2 = new EncuestaEditor
            {
                IdEncuesta = e2.IdEncuesta,
                IdVersion = ++_seqVersion,
                NumeroVersion = 1,
                Nombre = e2.Nombre,
                Estatus = CatalogoCapturaDinamica.EstatusBorrador,
                FechaCreacion = Fecha(-2),
                UsuarioCrea = "Administrador Portal",
                PoblacionObjetivo = 300,
                Publicacion = new PublicacionConfig
                {
                    FechaInicio = Fecha(3),
                    FechaCierre = Fecha(20),
                    RespuestaUnica = true,
                    Anonima = true,
                    RequiereAutenticacion = true,
                    MensajeInicial = "Tu opinión es confidencial.",
                    MensajeFinal = "¡Gracias!"
                }
            };
            v2.Segmentacion.Add(new SegmentoRegla { Clave = "s1", Tipo = "Puesto", Valor = "Gerentes" });
            v2.Preguntas.Add(P("c1", 1, CatalogoCapturaDinamica.TipoEscala, "¿Qué tan satisfecho estás con tu equipo de trabajo?", true,
                delegate(Pregunta p) { p.EscalaMinimo = 1; p.EscalaMaximo = 5; p.EtiquetaMinimo = "Nada"; p.EtiquetaMaximo = "Mucho"; }));
            v2.Preguntas.Add(P("c2", 2, CatalogoCapturaDinamica.TipoSiNo, "¿Recomendarías tu sucursal como lugar para trabajar?", true,
                delegate(Pregunta p) { p.Opciones = Ops("c2", "Sí", "No"); }));
            v2.Preguntas.Add(P("c3", 3, CatalogoCapturaDinamica.TipoTexto, "¿Qué cambiarías de tu entorno laboral?", false,
                delegate(Pregunta p) { p.TextoLargo = true; p.MaxCaracteres = 500; }));
            e2.Versiones.Add(v2);
            _encuestas.Add(e2);

            // ---------- Encuesta 3: cerrada ----------
            var e3 = new EncuestaAlmacen
            {
                IdEncuesta = ++_seqEncuesta,
                Nombre = "Detección de necesidades de capacitación",
                Descripcion = "Levantamiento anual de temas de capacitación.",
                FechaModificacion = Fecha(-40) + " 09:00",
                UsuarioModifica = "Administrador Portal"
            };
            var v3 = new EncuestaEditor
            {
                IdEncuesta = e3.IdEncuesta,
                IdVersion = ++_seqVersion,
                NumeroVersion = 1,
                Nombre = e3.Nombre,
                Estatus = CatalogoCapturaDinamica.EstatusCerrada,
                FechaCreacion = Fecha(-70),
                FechaPublicacion = Fecha(-60),
                UsuarioCrea = "Administrador Portal",
                PoblacionObjetivo = 40,
                Publicacion = new PublicacionConfig
                {
                    FechaInicio = Fecha(-60),
                    FechaCierre = Fecha(-30),
                    RespuestaUnica = true,
                    Anonima = false,
                    RequiereAutenticacion = true,
                    MensajeInicial = "Ayúdanos a planear la capacitación del próximo año.",
                    MensajeFinal = "¡Gracias!"
                }
            };
            v3.Preguntas.Add(P("d1", 1, CatalogoCapturaDinamica.TipoMultiple, "¿Qué temas te gustaría reforzar?", true,
                delegate(Pregunta p)
                {
                    p.Opciones = Ops("d1", "Productos de crédito", "Inversiones", "Atención a clientes", "Herramientas digitales");
                    p.PermitirOtro = true; p.MinSelecciones = 1; p.MaxSelecciones = 2;
                }));
            v3.Preguntas.Add(P("d2", 2, CatalogoCapturaDinamica.TipoDesplegable, "Modalidad preferida", true,
                delegate(Pregunta p) { p.Opciones = Ops("d2", "Presencial", "En línea en vivo", "Autoestudio"); }));
            e3.Versiones.Add(v3);
            _encuestas.Add(e3);
            GenerarRespuestas(e3.IdEncuesta, v3, 25, 77);
        }

        /// <summary>Encuesta de ejemplo con TODOS los tipos de pregunta y lógica condicional.</summary>
        private static List<Pregunta> PreguntasEncuestaCampanas()
        {
            var lista = new List<Pregunta>();

            // P1 - Opción única
            lista.Add(P("p1", 1, CatalogoCapturaDinamica.TipoUnica, "¿Qué tan útil fue el material de la campaña?", true,
                delegate(Pregunta p) { p.Opciones = Ops("p1", "Muy útil", "Útil", "Neutral", "Poco útil", "Nada útil"); }));

            // P2 - Fecha
            lista.Add(P("p2", 2, CatalogoCapturaDinamica.TipoFecha, "¿Cuándo recibiste el material por primera vez?", false, null));

            // P3 - Selección múltiple con "Otro" y mín/máx
            lista.Add(P("p3", 3, CatalogoCapturaDinamica.TipoMultiple, "¿Qué materiales utilizaste en esta campaña?", true,
                delegate(Pregunta p)
                {
                    p.Descripcion = "Puedes elegir de 1 a 3 opciones.";
                    p.Opciones = Ops("p3", "Guía comercial", "Argumentos de venta", "Presentación", "Video de producto", "Infografía");
                    p.PermitirOtro = true; p.MinSelecciones = 1; p.MaxSelecciones = 3;
                }));

            // P4 - Texto libre con límite
            lista.Add(P("p4", 4, CatalogoCapturaDinamica.TipoTexto, "¿Qué mejorarías en esta campaña?", false,
                delegate(Pregunta p) { p.TextoLargo = true; p.MinCaracteres = 10; p.MaxCaracteres = 300; }));

            // P5 - Opción única con lógica condicional
            lista.Add(P("p5", 5, CatalogoCapturaDinamica.TipoUnica, "¿Actualmente utilizas Productivity Suite?", true,
                delegate(Pregunta p)
                {
                    p.Opciones = Ops("p5", "Sí", "No", "No aplica");
                    p.Reglas.Add(new ReglaCondicional { Clave = "r1", Operador = "igual", Valor = "p5o1", Accion = CatalogoCapturaDinamica.AccionMostrar, ClaveDestino = "p6" });
                    p.Reglas.Add(new ReglaCondicional { Clave = "r2", Operador = "igual", Valor = "p5o2", Accion = CatalogoCapturaDinamica.AccionMostrar, ClaveDestino = "p7" });
                    p.Reglas.Add(new ReglaCondicional { Clave = "r3", Operador = "igual", Valor = "p5o3", Accion = CatalogoCapturaDinamica.AccionFinalizar, ClaveDestino = null });
                }));

            // P6 - Multiselección dependiente (Banca > Producto > Recurso)
            lista.Add(P("p6", 6, CatalogoCapturaDinamica.TipoDependiente, "¿Qué recursos de Productivity Suite consultas?", true,
                delegate(Pregunta p)
                {
                    p.Niveles.Add(new NivelDependiente { Nivel = 1, Nombre = "Banca", PermitirMultiple = false });
                    p.Niveles.Add(new NivelDependiente { Nivel = 2, Nombre = "Producto", PermitirMultiple = false });
                    p.Niveles.Add(new NivelDependiente { Nivel = 3, Nombre = "Recurso", PermitirMultiple = true });
                    AgregarArbol(p);
                }));

            // P7 - Desplegable
            lista.Add(P("p7", 7, CatalogoCapturaDinamica.TipoDesplegable, "¿Cuál es el principal motivo por el que no la utilizas?", true,
                delegate(Pregunta p) { p.Opciones = Ops("p7", "No la conozco", "No tengo acceso", "No me resulta útil", "Prefiero otra herramienta"); }));

            // P8 - Matriz
            lista.Add(P("p8", 8, CatalogoCapturaDinamica.TipoMatriz, "Evalúa los siguientes aspectos", true,
                delegate(Pregunta p)
                {
                    p.Filas = Ops("p8f", "Facilidad de uso", "Rapidez", "Soporte", "Claridad del material");
                    p.Columnas = Ops("p8c", "Muy insatisfecho", "Insatisfecho", "Neutral", "Satisfecho", "Muy satisfecho");
                }));

            // P9 - Escala 0 a 10
            lista.Add(P("p9", 9, CatalogoCapturaDinamica.TipoEscala, "¿Qué tan probable es que recomiendes la campaña a otro ejecutivo?", false,
                delegate(Pregunta p) { p.EscalaMinimo = 0; p.EscalaMaximo = 10; p.EtiquetaMinimo = "Nada probable"; p.EtiquetaMaximo = "Muy probable"; }));

            // P10 - Número
            lista.Add(P("p10", 10, CatalogoCapturaDinamica.TipoNumero, "¿A cuántos clientes les presentaste la campaña?", false,
                delegate(Pregunta p) { p.ValorMinimo = 0; p.ValorMaximo = 500; }));

            // P11 - Sí / No
            lista.Add(P("p11", 11, CatalogoCapturaDinamica.TipoSiNo, "¿Te gustaría recibir capacitación sobre la campaña?", false,
                delegate(Pregunta p) { p.Opciones = Ops("p11", "Sí", "No"); }));

            return lista;
        }

        private static void AgregarArbol(Pregunta p)
        {
            Action<string, int, string, string> add = delegate(string clave, int nivel, string padre, string texto)
            {
                p.OpcionesDependientes.Add(new OpcionDependiente { Clave = clave, Nivel = nivel, ClavePadre = padre, Texto = texto });
            };
            // Nivel 1: Banca
            add("b1", 1, null, "Banca Personal");
            add("b2", 1, null, "Premier");
            add("b3", 1, null, "RBB Digital");
            // Nivel 2: Producto
            add("b1p1", 2, "b1", "Tarjeta de crédito");
            add("b1p2", 2, "b1", "Crédito sin garantía");
            add("b1p3", 2, "b1", "Portabilidad");
            add("b1p4", 2, "b1", "Nómina");
            add("b2p1", 2, "b2", "Inversiones");
            add("b2p2", 2, "b2", "Seguros");
            add("b3p1", 2, "b3", "Banca móvil");
            add("b3p2", 2, "b3", "Onboarding digital");
            // Nivel 3: Recurso
            string[] recursos = { "Guía comercial", "Argumentos de venta", "Manejo de objeciones", "Presentación" };
            string[] productos = { "b1p1", "b1p2", "b1p3", "b1p4", "b2p1", "b2p2", "b3p1", "b3p2" };
            foreach (var prod in productos)
            {
                for (int i = 0; i < recursos.Length; i++)
                {
                    add(prod + "r" + (i + 1), 3, prod, recursos[i]);
                }
            }
        }

        private static Pregunta P(string clave, int orden, string tipo, string texto, bool obligatoria, Action<Pregunta> config)
        {
            var p = new Pregunta { Clave = clave, Orden = orden, Tipo = tipo, Texto = texto, Obligatoria = obligatoria };
            if (config != null) { config(p); }
            return p;
        }

        private static List<OpcionPregunta> Ops(string prefijo, params string[] textos)
        {
            var lista = new List<OpcionPregunta>();
            for (int i = 0; i < textos.Length; i++)
            {
                lista.Add(new OpcionPregunta { Clave = prefijo + "o" + (i + 1), Texto = textos[i] });
            }
            return lista;
        }

        /// <summary>
        /// Genera respuestas aleatorias (semilla fija) respetando la lógica condicional,
        /// para que la pestaña Resultados tenga datos de ejemplo.
        /// </summary>
        private static void GenerarRespuestas(int idEncuesta, EncuestaEditor v, int cantidad, int semilla)
        {
            var rnd = new Random(semilla);
            string[] nombres = { "Ana López", "Carlos Méndez", "Daniela Ruiz", "Eduardo Pérez", "Fernanda Soto", "Gabriel Torres",
                                 "Hilda Ramos", "Iván Castillo", "Julia Herrera", "Luis Navarro" };
            string[] comentarios =
            {
                "Más ejemplos prácticos para clientes.", "Enviar el material con más anticipación.",
                "La presentación es muy larga, resumirla.", "Agregar casos de éxito reales.",
                "Incluir un video corto para redes.", "Mejorar la guía de objeciones.",
                "Todo bien, el material fue claro.", "Tener el material disponible en el celular.",
                "Más capacitación previa al lanzamiento.", "Simplificar los argumentos de venta."
            };

            for (int n = 0; n < cantidad; n++)
            {
                var r = new RespuestaEncuesta
                {
                    IdRespuesta = ++_seqRespuesta,
                    IdEncuesta = idEncuesta,
                    IdVersion = v.IdVersion,
                    NumEmpleado = (40000000 + n * 37).ToString(CultureInfo.InvariantCulture),
                    NombreEmpleado = nombres[n % nombres.Length],
                    FechaRespuesta = Fecha(-rnd.Next(0, 6)) + " " + rnd.Next(8, 19).ToString("00") + ":" + rnd.Next(0, 59).ToString("00")
                };

                var mostrar = new HashSet<string>();   // destinos de reglas "mostrar" que se activaron
                var ocultar = new HashSet<string>();
                var destinosMostrar = new HashSet<string>(v.Preguntas.SelectMany(q => q.Reglas)
                                                          .Where(x => x.Accion == CatalogoCapturaDinamica.AccionMostrar)
                                                          .Select(x => x.ClaveDestino));
                string saltarHasta = null;
                bool finalizar = false;

                foreach (var p in v.Preguntas.OrderBy(q => q.Orden))
                {
                    if (finalizar) { break; }
                    if (saltarHasta != null)
                    {
                        if (p.Clave != saltarHasta) { continue; }
                        saltarHasta = null;
                    }
                    if (destinosMostrar.Contains(p.Clave) && !mostrar.Contains(p.Clave)) { continue; }
                    if (ocultar.Contains(p.Clave)) { continue; }
                    if (!p.Obligatoria && rnd.Next(100) < 20) { continue; }

                    string opcionElegida = GenerarRespuestaPregunta(p, r, rnd, comentarios);

                    foreach (var regla in p.Reglas)
                    {
                        if (regla.Operador != "igual" || regla.Valor != opcionElegida) { continue; }
                        if (regla.Accion == CatalogoCapturaDinamica.AccionMostrar) { mostrar.Add(regla.ClaveDestino); }
                        else if (regla.Accion == CatalogoCapturaDinamica.AccionOcultar) { ocultar.Add(regla.ClaveDestino); }
                        else if (regla.Accion == CatalogoCapturaDinamica.AccionIrA) { saltarHasta = regla.ClaveDestino; }
                        else if (regla.Accion == CatalogoCapturaDinamica.AccionFinalizar) { finalizar = true; }
                    }
                }
                _respuestas.Add(r);
            }
        }

        /// <summary>Agrega a r las filas de respuesta de la pregunta p. Regresa la opción elegida (para reglas).</summary>
        private static string GenerarRespuestaPregunta(Pregunta p, RespuestaEncuesta r, Random rnd, string[] comentarios)
        {
            Func<int, int> sesgado = delegate(int n) { return Math.Min(rnd.Next(n), rnd.Next(n)); };   // favorece las primeras opciones

            switch (p.Tipo)
            {
                case CatalogoCapturaDinamica.TipoUnica:
                case CatalogoCapturaDinamica.TipoDesplegable:
                case CatalogoCapturaDinamica.TipoSiNo:
                    {
                        if (p.PermitirOtro && rnd.Next(100) < 8)
                        {
                            Agregar(r, p.Clave, CatalogoCapturaDinamica.ClaveOtro, null, "Otro motivo", null, null);
                            return CatalogoCapturaDinamica.ClaveOtro;
                        }
                        var o = p.Opciones[sesgado(p.Opciones.Count)];
                        Agregar(r, p.Clave, o.Clave, null, null, null, null);
                        return o.Clave;
                    }
                case CatalogoCapturaDinamica.TipoMultiple:
                    {
                        int max = Math.Min(p.MaxSelecciones ?? p.Opciones.Count, p.Opciones.Count);
                        int min = Math.Max(1, p.MinSelecciones ?? 1);
                        int k = rnd.Next(min, max + 1);
                        var elegidas = p.Opciones.OrderBy(x => rnd.Next()).Take(k).ToList();
                        foreach (var o in elegidas) { Agregar(r, p.Clave, o.Clave, null, null, null, null); }
                        if (p.PermitirOtro && rnd.Next(100) < 15)
                        {
                            Agregar(r, p.Clave, CatalogoCapturaDinamica.ClaveOtro, null, "Material de redes sociales", null, null);
                        }
                        return elegidas.Count > 0 ? elegidas[0].Clave : null;
                    }
                case CatalogoCapturaDinamica.TipoTexto:
                    Agregar(r, p.Clave, null, null, comentarios[rnd.Next(comentarios.Length)], null, null);
                    return null;
                case CatalogoCapturaDinamica.TipoEscala:
                    {
                        int min = p.EscalaMinimo ?? 1;
                        int max = p.EscalaMaximo ?? 5;
                        int valor = max - sesgado(max - min + 1);
                        Agregar(r, p.Clave, null, null, null, valor, null);
                        return valor.ToString(CultureInfo.InvariantCulture);
                    }
                case CatalogoCapturaDinamica.TipoNumero:
                    {
                        int valor = rnd.Next(0, 60);
                        Agregar(r, p.Clave, null, null, null, valor, null);
                        return valor.ToString(CultureInfo.InvariantCulture);
                    }
                case CatalogoCapturaDinamica.TipoFecha:
                    {
                        string f = Fecha(-rnd.Next(6, 12));
                        Agregar(r, p.Clave, null, null, null, null, f);
                        return f;
                    }
                case CatalogoCapturaDinamica.TipoMatriz:
                    foreach (var fila in p.Filas)
                    {
                        var col = p.Columnas[p.Columnas.Count - 1 - sesgado(p.Columnas.Count)];
                        Agregar(r, p.Clave, col.Clave, fila.Clave, null, null, null);
                    }
                    return null;
                case CatalogoCapturaDinamica.TipoDependiente:
                    {
                        var nivel1 = p.OpcionesDependientes.Where(x => x.Nivel == 1).ToList();
                        var b = nivel1[sesgado(nivel1.Count)];
                        Agregar(r, p.Clave, b.Clave, null, null, null, null);
                        var nivel2 = p.OpcionesDependientes.Where(x => x.ClavePadre == b.Clave).ToList();
                        if (nivel2.Count == 0) { return b.Clave; }
                        var prod = nivel2[sesgado(nivel2.Count)];
                        Agregar(r, p.Clave, prod.Clave, null, null, null, null);
                        var nivel3 = p.OpcionesDependientes.Where(x => x.ClavePadre == prod.Clave)
                                                           .OrderBy(x => rnd.Next()).Take(rnd.Next(1, 3)).ToList();
                        foreach (var rec in nivel3) { Agregar(r, p.Clave, rec.Clave, null, null, null, null); }
                        return b.Clave;
                    }
            }
            return null;
        }

        private static void Agregar(RespuestaEncuesta r, string pregunta, string opcion, string fila, string texto, decimal? numero, string fecha)
        {
            r.Respuestas.Add(new RespuestaPregunta
            {
                ClavePregunta = pregunta,
                ClaveOpcion = opcion,
                ClaveFila = fila,
                ValorTexto = texto,
                ValorNumero = numero,
                ValorFecha = fecha
            });
        }
    }
}

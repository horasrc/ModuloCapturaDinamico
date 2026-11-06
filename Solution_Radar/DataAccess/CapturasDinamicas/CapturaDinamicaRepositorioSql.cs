using System;
using System.Collections.Generic;
using System.Data;
using System.Data.SqlClient;
using System.Globalization;
using System.Linq;
using Solution_Radar.Models.ModuloDinamico;

namespace Solution_Radar.DataAccess.CapturasDinamicas
{
    /// <summary>
    /// Implementación del repositorio contra SQL Server (tablas portal.capturadinamica_*).
    /// ADO.NET puro (SqlConnection / SqlCommand), sin Entity Framework.
    ///
    /// Reglas de negocio (iguales al Mock):
    ///  - Una versión publicada/cerrada/archivada con respuestas NO se sobrescribe:
    ///    se actualiza el borrador existente o se crea una versión nueva.
    ///  - Al publicar, la versión publicada anterior pasa a Archivada.
    ///  - Una respuesta por usuario cuando la versión lo indica.
    ///
    /// Las preguntas, opciones y reglas de una versión se guardan reemplazando su
    /// contenido completo (DELETE + INSERT) dentro de una transacción. Las respuestas
    /// apuntan a la "Clave" de la pregunta, por lo que no se afectan.
    /// </summary>
    public class CapturaDinamicaRepositorioSql : ICapturaDinamicaRepositorio
    {
        private readonly string _cadena;

        // IdEstatus (portal.capturadinamica_tc_estatus)
        private const byte IdBorrador = 1;
        private const byte IdPublicada = 2;
        private const byte IdCerrada = 3;
        private const byte IdArchivada = 4;

        public CapturaDinamicaRepositorioSql(string cadenaConexion)
        {
            _cadena = cadenaConexion;
        }

        // ==================================================================
        //  CONSULTAS
        // ==================================================================

        public List<EncuestaResumen> ListarEncuestas()
        {
            using (var cn = Abrir())
            {
                var encuestas = new List<EncuestaResumen>();
                using (var cmd = Comando(cn, null, @"
                    SELECT IdEncuesta, Nombre, Descripcion, FechaModificacion, FechaAlta, NombreEmpleadoModifica
                    FROM portal.capturadinamica_tp_encuesta WHERE Activo = 1 ORDER BY IdEncuesta DESC"))
                using (var r = cmd.ExecuteReader())
                {
                    while (r.Read())
                    {
                        encuestas.Add(new EncuestaResumen
                        {
                            IdEncuesta = r.GetInt32(0),
                            Nombre = Txt(r, 1),
                            Descripcion = Txt(r, 2),
                            FechaModificacion = FechaHora(r, r.IsDBNull(3) ? 4 : 3),
                            UsuarioModifica = Txt(r, 5)
                        });
                    }
                }

                var versiones = LeerResumenVersiones(cn, null, null);
                foreach (var e in encuestas)
                {
                    var propias = versiones.Where(v => v.IdEncuesta == e.IdEncuesta).ToList();
                    if (propias.Count == 0) { continue; }
                    var vigente = Vigente(propias);
                    var ultima = propias.OrderByDescending(v => v.NumeroVersion).First();
                    e.Estatus = vigente.Estatus;
                    e.IdVersionVigente = vigente.IdVersion;
                    e.NumeroVersionVigente = vigente.NumeroVersion;
                    e.NumeroVersionUltima = ultima.NumeroVersion;
                    e.EstatusUltimaVersion = ultima.Estatus;
                    e.TotalPreguntas = ultima.TotalPreguntas;
                    e.TotalRespuestas = propias.Sum(v => v.TotalRespuestas);
                    e.FechaInicio = vigente.FechaInicio;
                    e.FechaCierre = vigente.FechaCierre;
                }
                return encuestas.Where(e => e.Estatus != null).ToList();
            }
        }

        public EncuestaEditor ObtenerEncuesta(int idEncuesta, int? idVersion)
        {
            using (var cn = Abrir())
            {
                int? id = idVersion;
                if (id.HasValue && !VersionPertenece(cn, null, idEncuesta, id.Value)) { return null; }
                if (!id.HasValue)
                {
                    var ultima = LeerResumenVersiones(cn, null, idEncuesta).OrderByDescending(v => v.NumeroVersion).FirstOrDefault();
                    if (ultima == null) { return null; }
                    id = ultima.IdVersion;
                }
                return LeerVersion(cn, null, id.Value, true);
            }
        }

        public ResultadosEncuesta ObtenerResultados(int idEncuesta, int? idVersion)
        {
            using (var cn = Abrir())
            {
                var versiones = LeerResumenVersiones(cn, null, idEncuesta);
                if (versiones.Count == 0) { return null; }
                var conRespuestas = versiones.Where(v => v.TotalRespuestas > 0).OrderByDescending(v => v.NumeroVersion).ToList();

                ResumenVersionInterno elegida = null;
                if (idVersion.HasValue) { elegida = versiones.FirstOrDefault(v => v.IdVersion == idVersion.Value); }
                if (elegida == null && conRespuestas.Count > 0) { elegida = conRespuestas[0]; }
                if (elegida == null) { elegida = Vigente(versiones); }

                var def = LeerVersion(cn, null, elegida.IdVersion, false);
                var respuestas = LeerRespuestas(cn, elegida.IdVersion);
                var res = CapturaDinamicaResultadosServicio.Calcular(def, respuestas);
                foreach (var v in conRespuestas) { res.VersionesConRespuestas.Add(v.ComoVersionResumen()); }
                return res;
            }
        }

        public CapturaInfo ObtenerCaptura(int idEncuesta, UsuarioToken usuario)
        {
            using (var cn = Abrir())
            {
                var info = new CapturaInfo();
                var versiones = LeerResumenVersiones(cn, null, idEncuesta);
                if (versiones.Count == 0) { info.Mensaje = "La encuesta no existe."; return info; }

                var publicada = versiones.FirstOrDefault(v => v.IdEstatus == IdPublicada);
                if (publicada == null) { info.Mensaje = "Esta encuesta no se encuentra publicada en este momento."; return info; }

                var e = LeerVersion(cn, null, publicada.IdVersion, false);
                string hoy = CapturaDinamicaResultadosServicio.Hoy();
                var pub = e.Publicacion;
                if (!string.IsNullOrEmpty(pub.FechaInicio) && string.CompareOrdinal(hoy, pub.FechaInicio) < 0)
                {
                    info.Mensaje = "La encuesta estará disponible a partir del " + FechaTexto(pub.FechaInicio) + ".";
                    return info;
                }
                if (!string.IsNullOrEmpty(pub.FechaCierre) && string.CompareOrdinal(hoy, pub.FechaCierre) > 0)
                {
                    info.Mensaje = "La encuesta cerró el " + FechaTexto(pub.FechaCierre) + ".";
                    return info;
                }
                if (pub.RespuestaUnica && YaRespondio(cn, null, publicada.IdVersion, usuario))
                {
                    info.Mensaje = "Ya registraste tu respuesta a esta encuesta. ¡Gracias!";
                    return info;
                }

                // TODO BD: validar SEGMENTACIÓN (e.Segmentacion) contra los datos del empleado.

                info.PuedeResponder = true;
                info.Encuesta = e;
                return info;
            }
        }

        // ==================================================================
        //  OPERACIONES
        // ==================================================================

        public EncuestaEditor CrearEncuesta(string nombre, string descripcion, UsuarioToken usuario)
        {
            using (var cn = Abrir())
            using (var tx = cn.BeginTransaction())
            {
                int idEncuesta = InsertarEncuesta(cn, tx, string.IsNullOrWhiteSpace(nombre) ? "Nueva encuesta" : nombre.Trim(), descripcion, usuario);

                var v = new EncuestaEditor();
                v.Publicacion = new PublicacionConfig
                {
                    FechaInicio = CapturaDinamicaResultadosServicio.Hoy(),
                    FechaCierre = DateTime.Today.AddDays(30).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    RespuestaUnica = true,
                    RequiereAutenticacion = true,
                    MensajeFinal = "¡Gracias por tu respuesta!"
                };
                int idVersion = InsertarVersion(cn, tx, idEncuesta, 1, IdBorrador, usuario, null);
                ReemplazarContenido(cn, tx, idVersion, v);
                tx.Commit();
                return LeerVersion(cn, null, idVersion, true);
            }
        }

        public ResultadoOperacion GuardarBorrador(EncuestaEditor encuesta, UsuarioToken usuario)
        {
            using (var cn = Abrir())
            using (var tx = cn.BeginTransaction())
            {
                string mensaje;
                int? idVersion = GuardarInterno(cn, tx, encuesta, usuario, out mensaje);
                if (!idVersion.HasValue) { tx.Rollback(); return ResultadoOperacion.Error(mensaje); }
                tx.Commit();
                return ResultadoOperacion.Ok(LeerVersion(cn, null, idVersion.Value, true), mensaje);
            }
        }

        public ResultadoOperacion Publicar(EncuestaEditor encuesta, UsuarioToken usuario)
        {
            string error = ValidarParaPublicar(encuesta);
            if (error != null) { return ResultadoOperacion.Error(error); }

            using (var cn = Abrir())
            using (var tx = cn.BeginTransaction())
            {
                string mensaje;
                int? idVersion = GuardarInterno(cn, tx, encuesta, usuario, out mensaje);
                if (!idVersion.HasValue) { tx.Rollback(); return ResultadoOperacion.Error(mensaje); }

                // Primero se archiva la publicada anterior (índice único: una publicada por encuesta)
                Ejecutar(cn, tx, @"UPDATE portal.capturadinamica_tp_encuestaversion SET IdEstatus = @Archivada
                                   WHERE IdEncuesta = @IdEncuesta AND IdEstatus = @Publicada AND IdVersion <> @IdVersion",
                    P("@Archivada", IdArchivada), P("@Publicada", IdPublicada),
                    P("@IdEncuesta", encuesta.IdEncuesta), P("@IdVersion", idVersion.Value));
                Ejecutar(cn, tx, @"UPDATE portal.capturadinamica_tp_encuestaversion
                                   SET IdEstatus = @Publicada, FechaPublicacion = GETDATE(), NumEmpleadoPublica = @Num
                                   WHERE IdVersion = @IdVersion",
                    P("@Publicada", IdPublicada), P("@Num", NumEmpleado(usuario)), P("@IdVersion", idVersion.Value));
                tx.Commit();

                var e = LeerVersion(cn, null, idVersion.Value, true);
                return ResultadoOperacion.Ok(e, "Versión " + e.NumeroVersion + " publicada correctamente.");
            }
        }

        public ResultadoOperacion CambiarEstatus(int idEncuesta, string estatus, UsuarioToken usuario)
        {
            using (var cn = Abrir())
            using (var tx = cn.BeginTransaction())
            {
                var versiones = LeerResumenVersiones(cn, tx, idEncuesta);
                if (versiones.Count == 0) { return ResultadoOperacion.Error("La encuesta no existe."); }
                var vigente = Vigente(versiones);

                byte nuevo;
                if (estatus == CatalogoCapturaDinamica.EstatusCerrada)
                {
                    if (vigente.IdEstatus != IdPublicada) { return ResultadoOperacion.Error("Solo se puede cerrar una encuesta publicada."); }
                    nuevo = IdCerrada;
                }
                else if (estatus == CatalogoCapturaDinamica.EstatusPublicada)
                {
                    if (vigente.IdEstatus != IdCerrada) { return ResultadoOperacion.Error("Solo se puede reabrir una encuesta cerrada."); }
                    nuevo = IdPublicada;
                }
                else if (estatus == CatalogoCapturaDinamica.EstatusArchivada)
                {
                    nuevo = IdArchivada;
                }
                else
                {
                    return ResultadoOperacion.Error("Estatus no válido.");
                }

                Ejecutar(cn, tx, "UPDATE portal.capturadinamica_tp_encuestaversion SET IdEstatus = @Est WHERE IdVersion = @Id",
                    P("@Est", nuevo), P("@Id", vigente.IdVersion));
                MarcarModificacion(cn, tx, idEncuesta, usuario);
                tx.Commit();
                return ResultadoOperacion.Ok(LeerVersion(cn, null, vigente.IdVersion, true), "La encuesta ahora está " + estatus.ToLower() + ".");
            }
        }

        public ResultadoOperacion GuardarRespuesta(RespuestaEncuesta respuesta, UsuarioToken usuario)
        {
            using (var cn = Abrir())
            using (var tx = cn.BeginTransaction())
            {
                if (!VersionPertenece(cn, tx, respuesta.IdEncuesta, respuesta.IdVersion))
                {
                    return ResultadoOperacion.Error("La encuesta no existe.");
                }
                var version = LeerVersion(cn, tx, respuesta.IdVersion, false);
                if (version.Estatus != CatalogoCapturaDinamica.EstatusPublicada)
                {
                    return ResultadoOperacion.Error("La encuesta ya no está disponible para responder.");
                }
                if (version.Publicacion.RespuestaUnica && YaRespondio(cn, tx, respuesta.IdVersion, usuario))
                {
                    return ResultadoOperacion.Error("Ya registraste tu respuesta a esta encuesta.");
                }
                var validas = new HashSet<string>(version.Preguntas.Select(p => p.Clave));
                var filas = (respuesta.Respuestas ?? new List<RespuestaPregunta>()).Where(x => validas.Contains(x.ClavePregunta)).ToList();
                if (filas.Count == 0) { return ResultadoOperacion.Error("No se recibieron respuestas válidas."); }

                long id = InsertarRespuesta(cn, tx, respuesta.IdVersion, usuario, null, filas);
                tx.Commit();
                return ResultadoOperacion.Ok(id, version.Publicacion.MensajeFinal);
            }
        }

        // ==================================================================
        //  DATOS DE PRUEBA
        // ==================================================================

        private static readonly object _lockSemilla = new object();
        private static bool _semillaRevisada;

        /// <summary>
        /// Si la base no tiene encuestas, carga los datos de ejemplo del Mock.
        /// Solo para ambientes de prueba (se activa con el appSetting CapturaDinamica:CargarDatosPrueba = true).
        /// </summary>
        public void AsegurarDatosDePrueba()
        {
            lock (_lockSemilla)
            {
                if (_semillaRevisada) { return; }
                using (var cn = Abrir())
                {
                    int total = Convert.ToInt32(Escalar(cn, null, "SELECT COUNT(*) FROM portal.capturadinamica_tp_encuesta"));
                    if (total == 0)
                    {
                        using (var tx = cn.BeginTransaction())
                        {
                            var sistema = new UsuarioToken { NumEmpleado = "00000000", NombreEmpleado = "Administrador Portal" };
                            foreach (var s in CapturaDinamicaRepositorioMock.DatosSemilla())
                            {
                                int idEncuesta = InsertarEncuesta(cn, tx, s.Nombre, s.Descripcion, sistema);
                                var mapa = new Dictionary<int, int>();
                                foreach (var v in s.Versiones)
                                {
                                    var creador = new UsuarioToken { NombreEmpleado = v.UsuarioCrea };
                                    int idVersion = InsertarVersion(cn, tx, idEncuesta, v.NumeroVersion, EstatusId(v.Estatus), creador, v.FechaCreacion);
                                    ReemplazarContenido(cn, tx, idVersion, v);
                                    if (!string.IsNullOrEmpty(v.FechaPublicacion))
                                    {
                                        Ejecutar(cn, tx, "UPDATE portal.capturadinamica_tp_encuestaversion SET FechaPublicacion = @F WHERE IdVersion = @Id",
                                            P("@F", AFecha(v.FechaPublicacion)), P("@Id", idVersion));
                                    }
                                    mapa[v.IdVersion] = idVersion;
                                }
                                foreach (var r in s.Respuestas)
                                {
                                    var u = new UsuarioToken { NumEmpleado = r.NumEmpleado, NombreEmpleado = r.NombreEmpleado };
                                    InsertarRespuesta(cn, tx, mapa[r.IdVersion], u, r.FechaRespuesta, r.Respuestas);
                                }
                            }
                            tx.Commit();
                        }
                    }
                }
                _semillaRevisada = true;
            }
        }

        // ==================================================================
        //  REGLAS DE NEGOCIO INTERNAS
        // ==================================================================

        /// <summary>Aplica el versionado y guarda. Regresa el IdVersion resultante (null si hubo error).</summary>
        private int? GuardarInterno(SqlConnection cn, SqlTransaction tx, EncuestaEditor e, UsuarioToken usuario, out string mensaje)
        {
            var versiones = LeerResumenVersiones(cn, tx, e.IdEncuesta);
            var actual = versiones.FirstOrDefault(v => v.IdVersion == e.IdVersion);
            if (actual == null) { mensaje = "La versión no existe."; return null; }

            if (e.Preguntas == null) { e.Preguntas = new List<Pregunta>(); }
            if (e.Publicacion == null) { e.Publicacion = new PublicacionConfig(); }
            if (e.Segmentacion == null) { e.Segmentacion = new List<SegmentoRegla>(); }

            Ejecutar(cn, tx, @"UPDATE portal.capturadinamica_tp_encuesta
                               SET Nombre = COALESCE(NULLIF(LTRIM(RTRIM(@Nombre)), ''), Nombre), Descripcion = @Desc
                               WHERE IdEncuesta = @Id",
                P("@Nombre", e.Nombre), P("@Desc", e.Descripcion), P("@Id", e.IdEncuesta));
            MarcarModificacion(cn, tx, e.IdEncuesta, usuario);

            bool protegida = actual.IdEstatus != IdBorrador &&
                             (actual.TotalRespuestas > 0 || actual.IdEstatus == IdCerrada || actual.IdEstatus == IdArchivada);

            if (!protegida)
            {
                ReemplazarContenido(cn, tx, actual.IdVersion, e);
                mensaje = "Versión " + actual.NumeroVersion + " guardada.";
                return actual.IdVersion;
            }

            // La versión tiene respuestas: no se sobrescribe
            var borrador = versiones.FirstOrDefault(v => v.IdEstatus == IdBorrador);
            if (borrador != null)
            {
                ReemplazarContenido(cn, tx, borrador.IdVersion, e);
                mensaje = "La versión " + actual.NumeroVersion + " ya tiene respuestas; los cambios se guardaron en la versión " +
                          borrador.NumeroVersion + " (borrador).";
                return borrador.IdVersion;
            }

            int numero = versiones.Max(v => v.NumeroVersion) + 1;
            int nueva = InsertarVersion(cn, tx, e.IdEncuesta, numero, IdBorrador, usuario, null);
            ReemplazarContenido(cn, tx, nueva, e);
            mensaje = "La versión " + actual.NumeroVersion + " ya tiene respuestas; se creó la versión " + numero +
                      " (borrador) y se conservó el histórico.";
            return nueva;
        }

        private static string ValidarParaPublicar(EncuestaEditor e)
        {
            if (e.Preguntas == null || e.Preguntas.Count == 0) { return "Agrega al menos una pregunta antes de publicar."; }
            for (int i = 0; i < e.Preguntas.Count; i++)
            {
                if (string.IsNullOrWhiteSpace(e.Preguntas[i].Texto)) { return "La pregunta " + (i + 1) + " no tiene texto."; }
            }
            var p = e.Publicacion;
            if (p != null && !string.IsNullOrEmpty(p.FechaInicio) && !string.IsNullOrEmpty(p.FechaCierre) &&
                string.CompareOrdinal(p.FechaInicio, p.FechaCierre) > 0)
            {
                return "La fecha de cierre debe ser posterior a la fecha de inicio.";
            }
            return null;
        }

        // ==================================================================
        //  ESCRITURA
        // ==================================================================

        private int InsertarEncuesta(SqlConnection cn, SqlTransaction tx, string nombre, string descripcion, UsuarioToken u)
        {
            return Convert.ToInt32(Escalar(cn, tx, @"
                INSERT INTO portal.capturadinamica_tp_encuesta (Nombre, Descripcion, NumEmpleadoAlta, FechaModificacion, NumEmpleadoModifica, NombreEmpleadoModifica)
                VALUES (@Nombre, @Desc, @Num, GETDATE(), @Num, @NomEmp);
                SELECT CAST(SCOPE_IDENTITY() AS INT);",
                P("@Nombre", nombre), P("@Desc", descripcion), P("@Num", NumEmpleado(u)), P("@NomEmp", NombreEmpleado(u))));
        }

        private int InsertarVersion(SqlConnection cn, SqlTransaction tx, int idEncuesta, int numero, byte idEstatus, UsuarioToken u, string fechaAlta)
        {
            return Convert.ToInt32(Escalar(cn, tx, @"
                INSERT INTO portal.capturadinamica_tp_encuestaversion (IdEncuesta, NumeroVersion, IdEstatus, FechaAlta, NumEmpleadoAlta, NombreEmpleadoAlta)
                VALUES (@IdEncuesta, @Numero, @Estatus, COALESCE(@FechaAlta, GETDATE()), @Num, @NomEmp);
                SELECT CAST(SCOPE_IDENTITY() AS INT);",
                P("@IdEncuesta", idEncuesta), P("@Numero", numero), P("@Estatus", idEstatus), P("@FechaAlta", AFecha(fechaAlta)),
                P("@Num", NumEmpleado(u)), P("@NomEmp", NombreEmpleado(u))));
        }

        /// <summary>Actualiza la configuración de la versión y reemplaza preguntas, opciones, reglas y segmentación.</summary>
        private void ReemplazarContenido(SqlConnection cn, SqlTransaction tx, int idVersion, EncuestaEditor e)
        {
            var pub = e.Publicacion ?? new PublicacionConfig();
            Ejecutar(cn, tx, @"
                UPDATE portal.capturadinamica_tp_encuestaversion SET
                    FechaInicio = @Ini, FechaCierre = @Fin, RespuestaUnica = @Unica, Anonima = @Anon,
                    RequiereAutenticacion = @Aut, MensajeInicial = @MIni, MensajeFinal = @MFin, PoblacionObjetivo = @Pob
                WHERE IdVersion = @Id",
                P("@Ini", AFecha(pub.FechaInicio)), P("@Fin", AFecha(pub.FechaCierre)), P("@Unica", pub.RespuestaUnica),
                P("@Anon", pub.Anonima), P("@Aut", pub.RequiereAutenticacion), P("@MIni", pub.MensajeInicial),
                P("@MFin", pub.MensajeFinal), P("@Pob", e.PoblacionObjetivo), P("@Id", idVersion));

            // Borrar contenido anterior (las respuestas NO se tocan)
            Ejecutar(cn, tx, @"
                DELETE r FROM portal.capturadinamica_tp_reglacondicional r JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = r.IdPregunta WHERE p.IdVersion = @Id;
                DELETE d FROM portal.capturadinamica_tp_opciondependiente d JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = d.IdPregunta WHERE p.IdVersion = @Id;
                DELETE n FROM portal.capturadinamica_tp_niveldependiente n JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = n.IdPregunta WHERE p.IdVersion = @Id;
                DELETE o FROM portal.capturadinamica_tp_preguntaopcion o JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = o.IdPregunta WHERE p.IdVersion = @Id;
                DELETE FROM portal.capturadinamica_tp_pregunta WHERE IdVersion = @Id;
                DELETE FROM portal.capturadinamica_tp_segmentacion WHERE IdVersion = @Id;",
                P("@Id", idVersion));

            var tipos = Catalogo(cn, tx, "portal.capturadinamica_tc_tipopregunta", "IdTipoPregunta");
            var operadores = Catalogo(cn, tx, "portal.capturadinamica_tc_operador", "IdOperador");
            var acciones = Catalogo(cn, tx, "portal.capturadinamica_tc_accionregla", "IdAccion");
            var segmentos = Catalogo(cn, tx, "portal.capturadinamica_tc_tiposegmento", "IdTipoSegmento");

            foreach (var s in e.Segmentacion ?? new List<SegmentoRegla>())
            {
                byte idTipo;
                if (s.Tipo == null || !segmentos.TryGetValue(s.Tipo, out idTipo)) { continue; }
                Ejecutar(cn, tx, @"INSERT INTO portal.capturadinamica_tp_segmentacion (IdVersion, Clave, IdTipoSegmento, Valor)
                                   VALUES (@Id, @Clave, @Tipo, @Valor)",
                    P("@Id", idVersion), P("@Clave", s.Clave ?? Guid.NewGuid().ToString("N").Substring(0, 12)),
                    P("@Tipo", idTipo), P("@Valor", s.Valor ?? ""));
            }

            int orden = 0;
            foreach (var p in e.Preguntas ?? new List<Pregunta>())
            {
                orden++;
                byte idTipo;
                if (p.Tipo == null || !tipos.TryGetValue(p.Tipo, out idTipo))
                {
                    throw new InvalidOperationException("Tipo de pregunta no válido: " + p.Tipo);
                }
                int idPregunta = Convert.ToInt32(Escalar(cn, tx, @"
                    INSERT INTO portal.capturadinamica_tp_pregunta
                        (IdVersion, Clave, Orden, IdTipoPregunta, Texto, Descripcion, Obligatoria, OrdenAleatorio, PermitirOtro, TextoLargo,
                         MinCaracteres, MaxCaracteres, MinSelecciones, MaxSelecciones, ValorMinimo, ValorMaximo, PermitirDecimales,
                         EscalaMinimo, EscalaMaximo, EtiquetaMinimo, EtiquetaMaximo, FechaMinima, FechaMaxima)
                    VALUES
                        (@IdVersion, @Clave, @Orden, @Tipo, @Texto, @Desc, @Obl, @Ale, @Otro, @Largo,
                         @MinC, @MaxC, @MinS, @MaxS, @MinV, @MaxV, @Dec,
                         @EMin, @EMax, @EtMin, @EtMax, @FMin, @FMax);
                    SELECT CAST(SCOPE_IDENTITY() AS INT);",
                    P("@IdVersion", idVersion), P("@Clave", p.Clave), P("@Orden", orden), P("@Tipo", idTipo),
                    P("@Texto", p.Texto ?? ""), P("@Desc", p.Descripcion), P("@Obl", p.Obligatoria), P("@Ale", p.OrdenAleatorio),
                    P("@Otro", p.PermitirOtro), P("@Largo", p.TextoLargo), P("@MinC", p.MinCaracteres), P("@MaxC", p.MaxCaracteres),
                    P("@MinS", p.MinSelecciones), P("@MaxS", p.MaxSelecciones), P("@MinV", p.ValorMinimo), P("@MaxV", p.ValorMaximo),
                    P("@Dec", p.PermitirDecimales), P("@EMin", p.EscalaMinimo), P("@EMax", p.EscalaMaximo),
                    P("@EtMin", p.EtiquetaMinimo), P("@EtMax", p.EtiquetaMaximo), P("@FMin", AFecha(p.FechaMinima)), P("@FMax", AFecha(p.FechaMaxima))));

                InsertarOpciones(cn, tx, idPregunta, "O", p.Opciones);
                InsertarOpciones(cn, tx, idPregunta, "F", p.Filas);
                InsertarOpciones(cn, tx, idPregunta, "C", p.Columnas);

                foreach (var n in p.Niveles ?? new List<NivelDependiente>())
                {
                    Ejecutar(cn, tx, @"INSERT INTO portal.capturadinamica_tp_niveldependiente (IdPregunta, Nivel, Nombre, PermitirMultiple)
                                       VALUES (@Id, @Nivel, @Nombre, @Mul)",
                        P("@Id", idPregunta), P("@Nivel", n.Nivel), P("@Nombre", n.Nombre ?? ""), P("@Mul", n.PermitirMultiple));
                }
                int ordenDep = 0;
                foreach (var d in p.OpcionesDependientes ?? new List<OpcionDependiente>())
                {
                    Ejecutar(cn, tx, @"INSERT INTO portal.capturadinamica_tp_opciondependiente (IdPregunta, Clave, Nivel, ClavePadre, Texto, Orden)
                                       VALUES (@Id, @Clave, @Nivel, @Padre, @Texto, @Orden)",
                        P("@Id", idPregunta), P("@Clave", d.Clave), P("@Nivel", d.Nivel), P("@Padre", d.ClavePadre),
                        P("@Texto", d.Texto ?? ""), P("@Orden", ++ordenDep));
                }
                int ordenRegla = 0;
                foreach (var r in p.Reglas ?? new List<ReglaCondicional>())
                {
                    byte idOp, idAcc;
                    if (!operadores.TryGetValue(r.Operador ?? "igual", out idOp)) { idOp = operadores["igual"]; }
                    if (r.Accion == null || !acciones.TryGetValue(r.Accion, out idAcc)) { continue; }
                    Ejecutar(cn, tx, @"INSERT INTO portal.capturadinamica_tp_reglacondicional (IdPregunta, Clave, IdOperador, Valor, IdAccion, ClavePreguntaDestino, Orden)
                                       VALUES (@Id, @Clave, @Op, @Valor, @Acc, @Destino, @Orden)",
                        P("@Id", idPregunta), P("@Clave", r.Clave ?? Guid.NewGuid().ToString("N").Substring(0, 12)), P("@Op", idOp),
                        P("@Valor", r.Valor ?? ""), P("@Acc", idAcc),
                        P("@Destino", r.Accion == CatalogoCapturaDinamica.AccionFinalizar ? null : r.ClaveDestino), P("@Orden", ++ordenRegla));
                }
            }
        }

        private void InsertarOpciones(SqlConnection cn, SqlTransaction tx, int idPregunta, string tipoOpcion, List<OpcionPregunta> opciones)
        {
            if (opciones == null) { return; }
            int orden = 0;
            foreach (var o in opciones)
            {
                Ejecutar(cn, tx, @"INSERT INTO portal.capturadinamica_tp_preguntaopcion (IdPregunta, Clave, TipoOpcion, Texto, Orden)
                                   VALUES (@Id, @Clave, @Tipo, @Texto, @Orden)",
                    P("@Id", idPregunta), P("@Clave", o.Clave), P("@Tipo", tipoOpcion), P("@Texto", o.Texto ?? ""), P("@Orden", ++orden));
            }
        }

        private long InsertarRespuesta(SqlConnection cn, SqlTransaction tx, int idVersion, UsuarioToken u, string fecha, List<RespuestaPregunta> filas)
        {
            long id = Convert.ToInt64(Escalar(cn, tx, @"
                INSERT INTO portal.capturadinamica_tp_respuestaencuesta (IdVersion, NumEmpleado, NombreEmpleado, Puesto, Cencos, FechaRespuesta)
                VALUES (@IdVersion, @Num, @Nombre, @Puesto, @Cencos, COALESCE(@Fecha, GETDATE()));
                SELECT CAST(SCOPE_IDENTITY() AS BIGINT);",
                P("@IdVersion", idVersion), P("@Num", NumEmpleado(u)), P("@Nombre", NombreEmpleado(u)),
                P("@Puesto", u != null ? u.Puesto : null), P("@Cencos", u != null ? u.Cencos : null), P("@Fecha", AFechaHora(fecha))));

            foreach (var f in filas)
            {
                Ejecutar(cn, tx, @"
                    INSERT INTO portal.capturadinamica_tp_respuestapregunta (IdRespuesta, ClavePregunta, ClaveOpcion, ClaveFila, ValorTexto, ValorNumero, ValorFecha)
                    VALUES (@Id, @Preg, @Op, @Fila, @Texto, @Num, @Fecha)",
                    P("@Id", id), P("@Preg", f.ClavePregunta), P("@Op", f.ClaveOpcion), P("@Fila", f.ClaveFila),
                    P("@Texto", f.ValorTexto), P("@Num", f.ValorNumero), P("@Fecha", AFecha(f.ValorFecha)));
            }
            return id;
        }

        private void MarcarModificacion(SqlConnection cn, SqlTransaction tx, int idEncuesta, UsuarioToken u)
        {
            Ejecutar(cn, tx, @"UPDATE portal.capturadinamica_tp_encuesta
                               SET FechaModificacion = GETDATE(), NumEmpleadoModifica = @Num, NombreEmpleadoModifica = @Nombre
                               WHERE IdEncuesta = @Id",
                P("@Num", NumEmpleado(u)), P("@Nombre", NombreEmpleado(u)), P("@Id", idEncuesta));
        }

        // ==================================================================
        //  LECTURA
        // ==================================================================

        /// <summary>Resumen de versiones (de una encuesta o de todas si idEncuesta es null).</summary>
        private List<ResumenVersionInterno> LeerResumenVersiones(SqlConnection cn, SqlTransaction tx, int? idEncuesta)
        {
            var lista = new List<ResumenVersionInterno>();
            using (var cmd = Comando(cn, tx, @"
                SELECT v.IdVersion, v.IdEncuesta, v.NumeroVersion, v.IdEstatus, v.FechaInicio, v.FechaCierre,
                       v.FechaAlta, v.FechaPublicacion, v.NombreEmpleadoAlta,
                       (SELECT COUNT(*) FROM portal.capturadinamica_tp_pregunta p WHERE p.IdVersion = v.IdVersion) AS TotalPreguntas,
                       (SELECT COUNT(*) FROM portal.capturadinamica_tp_respuestaencuesta r WHERE r.IdVersion = v.IdVersion) AS TotalRespuestas
                FROM portal.capturadinamica_tp_encuestaversion v
                WHERE (@IdEncuesta IS NULL OR v.IdEncuesta = @IdEncuesta)",
                P("@IdEncuesta", idEncuesta)))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    lista.Add(new ResumenVersionInterno
                    {
                        IdVersion = r.GetInt32(0),
                        IdEncuesta = r.GetInt32(1),
                        NumeroVersion = r.GetInt32(2),
                        IdEstatus = r.GetByte(3),
                        FechaInicio = Fecha(r, 4),
                        FechaCierre = Fecha(r, 5),
                        FechaCreacion = Fecha(r, 6),
                        FechaPublicacion = Fecha(r, 7),
                        UsuarioCrea = Txt(r, 8),
                        TotalPreguntas = r.GetInt32(9),
                        TotalRespuestas = r.GetInt32(10)
                    });
                }
            }
            return lista;
        }

        /// <summary>Lee una versión completa (configuración, preguntas, opciones, niveles, reglas y segmentación).</summary>
        private EncuestaEditor LeerVersion(SqlConnection cn, SqlTransaction tx, int idVersion, bool conHistorial)
        {
            const string sql = @"
                SELECT v.IdVersion, v.IdEncuesta, v.NumeroVersion, v.IdEstatus, v.FechaInicio, v.FechaCierre, v.RespuestaUnica, v.Anonima,
                       v.RequiereAutenticacion, v.MensajeInicial, v.MensajeFinal, v.PoblacionObjetivo, v.FechaAlta, v.NombreEmpleadoAlta,
                       v.FechaPublicacion, e.Nombre, e.Descripcion,
                       (SELECT COUNT(*) FROM portal.capturadinamica_tp_respuestaencuesta r WHERE r.IdVersion = v.IdVersion) AS TotalRespuestas
                FROM portal.capturadinamica_tp_encuestaversion v
                JOIN portal.capturadinamica_tp_encuesta e ON e.IdEncuesta = v.IdEncuesta
                WHERE v.IdVersion = @Id;

                SELECT p.IdPregunta, p.Clave, p.Orden, t.Clave AS Tipo, p.Texto, p.Descripcion, p.Obligatoria, p.OrdenAleatorio, p.PermitirOtro,
                       p.TextoLargo, p.MinCaracteres, p.MaxCaracteres, p.MinSelecciones, p.MaxSelecciones, p.ValorMinimo, p.ValorMaximo,
                       p.PermitirDecimales, p.EscalaMinimo, p.EscalaMaximo, p.EtiquetaMinimo, p.EtiquetaMaximo, p.FechaMinima, p.FechaMaxima
                FROM portal.capturadinamica_tp_pregunta p
                JOIN portal.capturadinamica_tc_tipopregunta t ON t.IdTipoPregunta = p.IdTipoPregunta
                WHERE p.IdVersion = @Id ORDER BY p.Orden;

                SELECT o.IdPregunta, o.Clave, o.TipoOpcion, o.Texto
                FROM portal.capturadinamica_tp_preguntaopcion o
                JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = o.IdPregunta
                WHERE p.IdVersion = @Id ORDER BY o.IdPregunta, o.Orden;

                SELECT n.IdPregunta, n.Nivel, n.Nombre, n.PermitirMultiple
                FROM portal.capturadinamica_tp_niveldependiente n
                JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = n.IdPregunta
                WHERE p.IdVersion = @Id ORDER BY n.IdPregunta, n.Nivel;

                SELECT d.IdPregunta, d.Clave, d.Nivel, d.ClavePadre, d.Texto
                FROM portal.capturadinamica_tp_opciondependiente d
                JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = d.IdPregunta
                WHERE p.IdVersion = @Id ORDER BY d.IdPregunta, d.Orden;

                SELECT r.IdPregunta, r.Clave, op.Clave AS Operador, r.Valor, a.Clave AS Accion, r.ClavePreguntaDestino
                FROM portal.capturadinamica_tp_reglacondicional r
                JOIN portal.capturadinamica_tp_pregunta p ON p.IdPregunta = r.IdPregunta
                JOIN portal.capturadinamica_tc_operador op ON op.IdOperador = r.IdOperador
                JOIN portal.capturadinamica_tc_accionregla a ON a.IdAccion = r.IdAccion
                WHERE p.IdVersion = @Id ORDER BY r.IdPregunta, r.Orden;

                SELECT s.Clave, ts.Clave AS Tipo, s.Valor
                FROM portal.capturadinamica_tp_segmentacion s
                JOIN portal.capturadinamica_tc_tiposegmento ts ON ts.IdTipoSegmento = s.IdTipoSegmento
                WHERE s.IdVersion = @Id ORDER BY s.IdSegmentacion;";

            EncuestaEditor e = null;
            var porId = new Dictionary<int, Pregunta>();

            using (var cmd = Comando(cn, tx, sql, P("@Id", idVersion)))
            using (var r = cmd.ExecuteReader())
            {
                if (!r.Read()) { return null; }
                e = new EncuestaEditor
                {
                    IdVersion = r.GetInt32(0),
                    IdEncuesta = r.GetInt32(1),
                    NumeroVersion = r.GetInt32(2),
                    Estatus = EstatusClave(r.GetByte(3)),
                    PoblacionObjetivo = r.GetInt32(11),
                    FechaCreacion = Fecha(r, 12),
                    UsuarioCrea = Txt(r, 13),
                    FechaPublicacion = Fecha(r, 14),
                    Nombre = Txt(r, 15),
                    Descripcion = Txt(r, 16),
                    TotalRespuestas = r.GetInt32(17),
                    Publicacion = new PublicacionConfig
                    {
                        FechaInicio = Fecha(r, 4),
                        FechaCierre = Fecha(r, 5),
                        RespuestaUnica = r.GetBoolean(6),
                        Anonima = r.GetBoolean(7),
                        RequiereAutenticacion = r.GetBoolean(8),
                        MensajeInicial = Txt(r, 9),
                        MensajeFinal = Txt(r, 10)
                    }
                };

                r.NextResult();   // Preguntas
                while (r.Read())
                {
                    var p = new Pregunta
                    {
                        Clave = Txt(r, 1),
                        Orden = r.GetInt32(2),
                        Tipo = Txt(r, 3),
                        Texto = Txt(r, 4),
                        Descripcion = Txt(r, 5),
                        Obligatoria = r.GetBoolean(6),
                        OrdenAleatorio = r.GetBoolean(7),
                        PermitirOtro = r.GetBoolean(8),
                        TextoLargo = r.GetBoolean(9),
                        MinCaracteres = Ent(r, 10),
                        MaxCaracteres = Ent(r, 11),
                        MinSelecciones = Ent(r, 12),
                        MaxSelecciones = Ent(r, 13),
                        ValorMinimo = Dec(r, 14),
                        ValorMaximo = Dec(r, 15),
                        PermitirDecimales = r.GetBoolean(16),
                        EscalaMinimo = Ent(r, 17),
                        EscalaMaximo = Ent(r, 18),
                        EtiquetaMinimo = Txt(r, 19),
                        EtiquetaMaximo = Txt(r, 20),
                        FechaMinima = Fecha(r, 21),
                        FechaMaxima = Fecha(r, 22)
                    };
                    porId[r.GetInt32(0)] = p;
                    e.Preguntas.Add(p);
                }

                r.NextResult();   // Opciones / filas / columnas
                while (r.Read())
                {
                    var p = porId[r.GetInt32(0)];
                    var o = new OpcionPregunta { Clave = Txt(r, 1), Texto = Txt(r, 3) };
                    string tipo = Txt(r, 2);
                    if (tipo == "F") { p.Filas.Add(o); }
                    else if (tipo == "C") { p.Columnas.Add(o); }
                    else { p.Opciones.Add(o); }
                }

                r.NextResult();   // Niveles
                while (r.Read())
                {
                    porId[r.GetInt32(0)].Niveles.Add(new NivelDependiente { Nivel = r.GetByte(1), Nombre = Txt(r, 2), PermitirMultiple = r.GetBoolean(3) });
                }

                r.NextResult();   // Opciones dependientes
                while (r.Read())
                {
                    porId[r.GetInt32(0)].OpcionesDependientes.Add(new OpcionDependiente
                    {
                        Clave = Txt(r, 1),
                        Nivel = r.GetByte(2),
                        ClavePadre = Txt(r, 3),
                        Texto = Txt(r, 4)
                    });
                }

                r.NextResult();   // Reglas
                while (r.Read())
                {
                    porId[r.GetInt32(0)].Reglas.Add(new ReglaCondicional
                    {
                        Clave = Txt(r, 1),
                        Operador = Txt(r, 2),
                        Valor = Txt(r, 3),
                        Accion = Txt(r, 4),
                        ClaveDestino = Txt(r, 5)
                    });
                }

                r.NextResult();   // Segmentación
                while (r.Read())
                {
                    e.Segmentacion.Add(new SegmentoRegla { Clave = Txt(r, 0), Tipo = Txt(r, 1), Valor = Txt(r, 2) });
                }
            }

            if (conHistorial)
            {
                e.Versiones = LeerResumenVersiones(cn, tx, e.IdEncuesta)
                    .OrderByDescending(v => v.NumeroVersion)
                    .Select(v => v.ComoVersionResumen())
                    .ToList();
            }
            return e;
        }

        private List<RespuestaEncuesta> LeerRespuestas(SqlConnection cn, int idVersion)
        {
            var lista = new List<RespuestaEncuesta>();
            var porId = new Dictionary<long, RespuestaEncuesta>();
            using (var cmd = Comando(cn, null, @"
                SELECT re.IdRespuesta, re.NumEmpleado, re.NombreEmpleado, re.FechaRespuesta,
                       rp.ClavePregunta, rp.ClaveOpcion, rp.ClaveFila, rp.ValorTexto, rp.ValorNumero, rp.ValorFecha
                FROM portal.capturadinamica_tp_respuestaencuesta re
                LEFT JOIN portal.capturadinamica_tp_respuestapregunta rp ON rp.IdRespuesta = re.IdRespuesta
                WHERE re.IdVersion = @Id
                ORDER BY re.IdRespuesta, rp.IdRespuestaPregunta",
                P("@Id", idVersion)))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read())
                {
                    long id = r.GetInt64(0);
                    RespuestaEncuesta enc;
                    if (!porId.TryGetValue(id, out enc))
                    {
                        enc = new RespuestaEncuesta
                        {
                            IdRespuesta = (int)id,
                            IdVersion = idVersion,
                            NumEmpleado = Txt(r, 1),
                            NombreEmpleado = Txt(r, 2),
                            FechaRespuesta = FechaHora(r, 3)
                        };
                        porId[id] = enc;
                        lista.Add(enc);
                    }
                    if (r.IsDBNull(4)) { continue; }
                    enc.Respuestas.Add(new RespuestaPregunta
                    {
                        ClavePregunta = Txt(r, 4),
                        ClaveOpcion = Txt(r, 5),
                        ClaveFila = Txt(r, 6),
                        ValorTexto = Txt(r, 7),
                        ValorNumero = Dec(r, 8),
                        ValorFecha = Fecha(r, 9)
                    });
                }
            }
            return lista;
        }

        private bool VersionPertenece(SqlConnection cn, SqlTransaction tx, int idEncuesta, int idVersion)
        {
            return Convert.ToInt32(Escalar(cn, tx,
                "SELECT COUNT(*) FROM portal.capturadinamica_tp_encuestaversion WHERE IdVersion = @V AND IdEncuesta = @E",
                P("@V", idVersion), P("@E", idEncuesta))) > 0;
        }

        private bool YaRespondio(SqlConnection cn, SqlTransaction tx, int idVersion, UsuarioToken u)
        {
            if (u == null || string.IsNullOrEmpty(u.NumEmpleado)) { return false; }
            return Convert.ToInt32(Escalar(cn, tx,
                "SELECT COUNT(*) FROM portal.capturadinamica_tp_respuestaencuesta WHERE IdVersion = @V AND NumEmpleado = @N",
                P("@V", idVersion), P("@N", u.NumEmpleado))) > 0;
        }

        /// <summary>Catálogo Clave -> Id (tipos de pregunta, operadores, acciones, segmentos).</summary>
        private static Dictionary<string, byte> Catalogo(SqlConnection cn, SqlTransaction tx, string tabla, string columnaId)
        {
            var d = new Dictionary<string, byte>(StringComparer.OrdinalIgnoreCase);
            using (var cmd = Comando(cn, tx, "SELECT " + columnaId + ", Clave FROM " + tabla))
            using (var r = cmd.ExecuteReader())
            {
                while (r.Read()) { d[r.GetString(1)] = r.GetByte(0); }
            }
            return d;
        }

        /// <summary>Vigente = publicada; si no hay, la cerrada más reciente; si no, la última.</summary>
        private static ResumenVersionInterno Vigente(List<ResumenVersionInterno> versiones)
        {
            var pub = versiones.FirstOrDefault(v => v.IdEstatus == IdPublicada);
            if (pub != null) { return pub; }
            var cerrada = versiones.Where(v => v.IdEstatus == IdCerrada).OrderByDescending(v => v.NumeroVersion).FirstOrDefault();
            return cerrada ?? versiones.OrderByDescending(v => v.NumeroVersion).First();
        }

        private class ResumenVersionInterno
        {
            public int IdVersion;
            public int IdEncuesta;
            public int NumeroVersion;
            public byte IdEstatus;
            public string FechaInicio;
            public string FechaCierre;
            public string FechaCreacion;
            public string FechaPublicacion;
            public string UsuarioCrea;
            public int TotalPreguntas;
            public int TotalRespuestas;
            public string Estatus { get { return EstatusClave(IdEstatus); } }

            public VersionResumen ComoVersionResumen()
            {
                return new VersionResumen
                {
                    IdVersion = IdVersion,
                    NumeroVersion = NumeroVersion,
                    Estatus = Estatus,
                    FechaCreacion = FechaCreacion,
                    FechaPublicacion = FechaPublicacion,
                    UsuarioCrea = UsuarioCrea,
                    TotalRespuestas = TotalRespuestas
                };
            }
        }

        // ==================================================================
        //  UTILERÍAS ADO.NET
        // ==================================================================

        private SqlConnection Abrir()
        {
            var cn = new SqlConnection(_cadena);
            cn.Open();
            return cn;
        }

        private static SqlCommand Comando(SqlConnection cn, SqlTransaction tx, string sql, params SqlParameter[] parametros)
        {
            var cmd = new SqlCommand(sql, cn, tx);
            cmd.CommandTimeout = 60;
            if (parametros != null) { cmd.Parameters.AddRange(parametros); }
            return cmd;
        }

        private static void Ejecutar(SqlConnection cn, SqlTransaction tx, string sql, params SqlParameter[] parametros)
        {
            using (var cmd = Comando(cn, tx, sql, parametros)) { cmd.ExecuteNonQuery(); }
        }

        private static object Escalar(SqlConnection cn, SqlTransaction tx, string sql, params SqlParameter[] parametros)
        {
            using (var cmd = Comando(cn, tx, sql, parametros)) { return cmd.ExecuteScalar(); }
        }

        /// <summary>Parámetro; null se envía como DBNull.</summary>
        private static SqlParameter P(string nombre, object valor)
        {
            return new SqlParameter(nombre, valor ?? DBNull.Value);
        }

        private static string Txt(IDataRecord r, int i) { return r.IsDBNull(i) ? null : Convert.ToString(r.GetValue(i), CultureInfo.InvariantCulture); }
        private static int? Ent(IDataRecord r, int i) { return r.IsDBNull(i) ? (int?)null : Convert.ToInt32(r.GetValue(i)); }
        private static decimal? Dec(IDataRecord r, int i) { return r.IsDBNull(i) ? (decimal?)null : Convert.ToDecimal(r.GetValue(i)); }

        private static string Fecha(IDataRecord r, int i)
        {
            return r.IsDBNull(i) ? null : r.GetDateTime(i).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }

        private static string FechaHora(IDataRecord r, int i)
        {
            return r.IsDBNull(i) ? null : r.GetDateTime(i).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        }

        /// <summary>"yyyy-MM-dd" (o "yyyy-MM-dd HH:mm") -> DateTime para SQL; vacío = null.</summary>
        private static object AFecha(string texto)
        {
            if (string.IsNullOrEmpty(texto)) { return null; }
            DateTime f;
            if (DateTime.TryParseExact(texto.Length > 10 ? texto.Substring(0, 10) : texto, "yyyy-MM-dd",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out f))
            {
                return f;
            }
            return null;
        }

        private static object AFechaHora(string texto)
        {
            if (string.IsNullOrEmpty(texto)) { return null; }
            DateTime f;
            if (DateTime.TryParseExact(texto, new[] { "yyyy-MM-dd HH:mm", "yyyy-MM-dd" }, CultureInfo.InvariantCulture, DateTimeStyles.None, out f))
            {
                return f;
            }
            return null;
        }

        private static string FechaTexto(string iso)
        {
            var f = AFecha(iso);
            return f == null ? iso : ((DateTime)f).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);
        }

        private static string NumEmpleado(UsuarioToken u) { return u == null ? null : u.NumEmpleado; }
        private static string NombreEmpleado(UsuarioToken u) { return u == null || string.IsNullOrEmpty(u.NombreEmpleado) ? "Sistema" : u.NombreEmpleado; }

        private static string EstatusClave(byte id)
        {
            switch (id)
            {
                case IdBorrador: return CatalogoCapturaDinamica.EstatusBorrador;
                case IdPublicada: return CatalogoCapturaDinamica.EstatusPublicada;
                case IdCerrada: return CatalogoCapturaDinamica.EstatusCerrada;
                default: return CatalogoCapturaDinamica.EstatusArchivada;
            }
        }

        private static byte EstatusId(string clave)
        {
            if (clave == CatalogoCapturaDinamica.EstatusPublicada) { return IdPublicada; }
            if (clave == CatalogoCapturaDinamica.EstatusCerrada) { return IdCerrada; }
            if (clave == CatalogoCapturaDinamica.EstatusArchivada) { return IdArchivada; }
            return IdBorrador;
        }
    }
}

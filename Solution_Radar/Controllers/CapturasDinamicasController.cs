using System;
using System.Collections.Generic;
using System.Configuration;
using System.Globalization;
using System.Text;
using System.Web.Mvc;
using System.Web.Script.Serialization;
using Solution_Radar.DataAccess.CapturasDinamicas;
using Solution_Radar.Models.ModuloDinamico;

namespace Solution_Radar.Controllers
{
    /// <summary>
    /// Módulo de CAPTURA DINÁMICA (encuestas / capturas configurables).
    ///
    /// Vistas:
    ///   /CapturasDinamicas/Administrador          -> listado de encuestas
    ///   /CapturasDinamicas/Editor/{id}            -> constructor, configuración, vista previa y resultados
    ///   /CapturasDinamicas/Captura/{id}           -> pantalla donde el usuario responde
    ///
    /// Endpoints JSON (los consume Scripts/CapturasDinamicas/cd.api.js).
    /// Todas las respuestas tienen la forma { Exito, Mensaje, Datos }.
    ///
    /// Seguridad / roles: se manejan en el portal (no se agregan aquí).
    /// El usuario llega en el parámetro "usuario" (JSON del objeto Token del portal).
    /// </summary>
    public class CapturasDinamicasController : Controller
    {
        private readonly ICapturaDinamicaRepositorio _repositorio;

        /// <summary>
        /// Elige dónde se guardan los datos:
        ///  - appSetting "CapturaDinamica:NombreConexion" indica qué cadena de connectionStrings usar
        ///    (por ejemplo "CNN", la conexión que ya tiene el portal). Si no existe, se busca "CapturaDinamica".
        ///  - Si la cadena existe se usa SQL Server; si no, datos mock en memoria.
        ///
        ///   &lt;appSettings&gt;
        ///     &lt;add key="CapturaDinamica:NombreConexion" value="CNN" /&gt;
        ///   &lt;/appSettings&gt;
        ///
        /// En ambientes de prueba, appSetting "CapturaDinamica:CargarDatosPrueba" = "true"
        /// carga las encuestas de ejemplo cuando la base está vacía. No usarlo en producción.
        /// </summary>
        public CapturasDinamicasController()
        {
            string nombreConexion = ConfigurationManager.AppSettings["CapturaDinamica:NombreConexion"];
            if (string.IsNullOrWhiteSpace(nombreConexion)) { nombreConexion = "CapturaDinamica"; }
            var cadena = ConfigurationManager.ConnectionStrings[nombreConexion];
            if (cadena != null && !string.IsNullOrWhiteSpace(cadena.ConnectionString))
            {
                var sql = new CapturaDinamicaRepositorioSql(cadena.ConnectionString);
                if (string.Equals(ConfigurationManager.AppSettings["CapturaDinamica:CargarDatosPrueba"], "true", StringComparison.OrdinalIgnoreCase))
                {
                    sql.AsegurarDatosDePrueba();
                }
                _repositorio = sql;
            }
            else
            {
                _repositorio = new CapturaDinamicaRepositorioMock();
            }
        }

        // ==================================================================
        //  VISTAS
        // ==================================================================

        /// <summary>Listado de encuestas (administrador).</summary>
        public ActionResult Administrador()
        {
            return View();
        }

        /// <summary>Constructor de la encuesta.</summary>
        public ActionResult Editor(int id)
        {
            ViewBag.IdEncuesta = id;
            return View();
        }

        /// <summary>Pantalla de captura (usuario final).</summary>
        public ActionResult Captura(int id)
        {
            ViewBag.IdEncuesta = id;
            return View();
        }

        // Versiones parciales por si se quieren incrustar en otra pantalla del portal
        // (por ejemplo con @Html.Action("AdministradorParcial", "CapturasDinamicas")).
        [ChildActionOnly]
        public ActionResult AdministradorParcial()
        {
            return PartialView("_ListadoEncuestas");
        }

        [ChildActionOnly]
        public ActionResult CapturaParcial(int id)
        {
            ViewBag.IdEncuesta = id;
            return PartialView("_CapturaFormulario");
        }

        // ==================================================================
        //  API JSON - ADMINISTRADOR
        // ==================================================================

        [HttpGet]
        public ActionResult ListarEncuestas()
        {
            return Ejecutar(delegate
            {
                return ResultadoOperacion.Ok(_repositorio.ListarEncuestas(), null);
            });
        }

        [HttpGet]
        public ActionResult ObtenerEncuesta(int id, int? idVersion)
        {
            return Ejecutar(delegate
            {
                var encuesta = _repositorio.ObtenerEncuesta(id, idVersion);
                return encuesta == null
                    ? ResultadoOperacion.Error("No se encontró la encuesta.")
                    : ResultadoOperacion.Ok(encuesta, null);
            });
        }

        [HttpPost]
        [ValidateInput(false)]
        public ActionResult CrearEncuesta(string datos, string usuario)
        {
            return Ejecutar(delegate
            {
                var e = Deserializar<EncuestaEditor>(datos);
                var nueva = _repositorio.CrearEncuesta(e.Nombre, e.Descripcion, LeerUsuario(usuario));
                return ResultadoOperacion.Ok(nueva, "Encuesta creada.");
            });
        }

        [HttpPost]
        [ValidateInput(false)]
        public ActionResult GuardarBorrador(string datos, string usuario)
        {
            return Ejecutar(delegate
            {
                return _repositorio.GuardarBorrador(Deserializar<EncuestaEditor>(datos), LeerUsuario(usuario));
            });
        }

        [HttpPost]
        [ValidateInput(false)]
        public ActionResult PublicarEncuesta(string datos, string usuario)
        {
            return Ejecutar(delegate
            {
                return _repositorio.Publicar(Deserializar<EncuestaEditor>(datos), LeerUsuario(usuario));
            });
        }

        [HttpPost]
        public ActionResult CambiarEstatus(int id, string estatus, string usuario)
        {
            return Ejecutar(delegate
            {
                return _repositorio.CambiarEstatus(id, estatus, LeerUsuario(usuario));
            });
        }

        [HttpGet]
        public ActionResult ObtenerResultados(int id, int? idVersion)
        {
            return Ejecutar(delegate
            {
                var res = _repositorio.ObtenerResultados(id, idVersion);
                return res == null
                    ? ResultadoOperacion.Error("No se encontró la encuesta.")
                    : ResultadoOperacion.Ok(res, null);
            });
        }

        // ==================================================================
        //  API JSON - CAPTURA (usuario final)
        // ==================================================================

        [HttpPost]
        public ActionResult ObtenerCaptura(int id, string usuario)
        {
            return Ejecutar(delegate
            {
                return ResultadoOperacion.Ok(_repositorio.ObtenerCaptura(id, LeerUsuario(usuario)), null);
            });
        }

        [HttpPost]
        [ValidateInput(false)]
        public ActionResult GuardarRespuesta(string datos, string usuario)
        {
            return Ejecutar(delegate
            {
                return _repositorio.GuardarRespuesta(Deserializar<RespuestaEncuesta>(datos), LeerUsuario(usuario));
            });
        }

        /// <summary>Última captura de la encuesta cuyo campo llave tenga el valor indicado.</summary>
        [HttpPost]
        [ValidateInput(false)]
        public ActionResult BuscarPorLlave(int id, string clave, string valor)
        {
            return Ejecutar(delegate
            {
                return ResultadoOperacion.Ok(_repositorio.BuscarPorLlave(id, clave, valor), null);
            });
        }

        // ==================================================================
        //  CALENDARIO DE OUTLOOK (.ics)
        // ==================================================================

        /// <summary>
        /// Regresa un archivo .ics con los eventos indicados (JSON: lista de EventoCalendario).
        /// Outlook (y cualquier calendario) lo abre para agregar la cita.
        /// No depende de la base de datos.
        /// </summary>
        [HttpGet]
        [ValidateInput(false)]
        public ActionResult DescargarCalendario(string eventos)
        {
            List<EventoCalendario> lista;
            try
            {
                lista = Deserializar<List<EventoCalendario>>(eventos) ?? new List<EventoCalendario>();
            }
            catch
            {
                return new HttpStatusCodeResult(400, "Eventos no válidos");
            }

            var ics = new StringBuilder();
            ics.Append("BEGIN:VCALENDAR\r\n");
            ics.Append("VERSION:2.0\r\n");
            ics.Append("PRODID:-//Portal Radar//Captura Dinamica//ES\r\n");
            ics.Append("CALSCALE:GREGORIAN\r\n");
            ics.Append("METHOD:PUBLISH\r\n");

            int agregados = 0;
            foreach (var ev in lista)
            {
                if (agregados >= 20) { break; }
                DateTime fecha;
                if (!DateTime.TryParseExact(ev.Fecha, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out fecha)) { continue; }

                ics.Append("BEGIN:VEVENT\r\n");
                ics.Append("UID:" + Guid.NewGuid().ToString("N") + "@capturadinamica\r\n");
                ics.Append("DTSTAMP:" + DateTime.UtcNow.ToString("yyyyMMdd'T'HHmmss'Z'", CultureInfo.InvariantCulture) + "\r\n");

                DateTime hora;
                bool conHora = !string.IsNullOrEmpty(ev.Hora) &&
                               DateTime.TryParseExact(ev.Hora, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out hora);
                if (conHora)
                {
                    // Hora local (sin zona): Outlook la toma en la zona horaria del equipo
                    var inicio = fecha.Add(DateTime.ParseExact(ev.Hora, "HH:mm", CultureInfo.InvariantCulture).TimeOfDay);
                    int minutos = ev.Duracion.HasValue && ev.Duracion.Value > 0 ? Math.Min(ev.Duracion.Value, 24 * 60) : 60;
                    ics.Append("DTSTART:" + inicio.ToString("yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture) + "\r\n");
                    ics.Append("DTEND:" + inicio.AddMinutes(minutos).ToString("yyyyMMdd'T'HHmmss", CultureInfo.InvariantCulture) + "\r\n");
                }
                else
                {
                    // Evento de todo el día
                    ics.Append("DTSTART;VALUE=DATE:" + fecha.ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "\r\n");
                    ics.Append("DTEND;VALUE=DATE:" + fecha.AddDays(1).ToString("yyyyMMdd", CultureInfo.InvariantCulture) + "\r\n");
                    ics.Append("X-MICROSOFT-CDO-ALLDAYEVENT:TRUE\r\n");
                }
                ics.Append("SUMMARY:" + EscaparIcs(string.IsNullOrWhiteSpace(ev.Titulo) ? "Evento" : ev.Titulo) + "\r\n");
                if (!string.IsNullOrWhiteSpace(ev.Descripcion)) { ics.Append("DESCRIPTION:" + EscaparIcs(ev.Descripcion) + "\r\n"); }
                ics.Append("TRANSP:OPAQUE\r\n");
                ics.Append("BEGIN:VALARM\r\nTRIGGER:-PT15M\r\nACTION:DISPLAY\r\nDESCRIPTION:Recordatorio\r\nEND:VALARM\r\n");
                ics.Append("END:VEVENT\r\n");
                agregados++;
            }
            ics.Append("END:VCALENDAR\r\n");

            if (agregados == 0) { return new HttpStatusCodeResult(400, "Sin eventos"); }

            Response.Cache.SetCacheability(System.Web.HttpCacheability.NoCache);
            var bytes = new UTF8Encoding(false).GetBytes(ics.ToString());
            return File(bytes, "text/calendar; charset=utf-8", "evento_calendario.ics");
        }

        /// <summary>Escapa texto para iCalendar (RFC 5545).</summary>
        private static string EscaparIcs(string texto)
        {
            return (texto ?? "")
                .Replace("\\", "\\\\")
                .Replace(";", "\\;")
                .Replace(",", "\\,")
                .Replace("\r\n", "\\n")
                .Replace("\n", "\\n")
                .Replace("\r", "");
        }

        // ==================================================================
        //  UTILERÍAS
        // ==================================================================

        /// <summary>Ejecuta la operación y regresa JSON; cualquier excepción se regresa como Exito=false.</summary>
        private ActionResult Ejecutar(Func<ResultadoOperacion> operacion)
        {
            ResultadoOperacion resultado;
            try
            {
                resultado = operacion();
            }
            catch (Exception ex)
            {
                // TODO: registrar ex en la bitácora del portal
                resultado = ResultadoOperacion.Error("Ocurrió un error al procesar la solicitud: " + ex.Message);
            }

            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            Response.Cache.SetCacheability(System.Web.HttpCacheability.NoCache);
            return Content(js.Serialize(resultado), "application/json");
        }

        private static T Deserializar<T>(string json)
        {
            if (string.IsNullOrEmpty(json)) { throw new ArgumentException("No se recibió información."); }
            var js = new JavaScriptSerializer();
            js.MaxJsonLength = int.MaxValue;
            return js.Deserialize<T>(json);
        }

        /// <summary>
        /// Convierte el JSON del objeto Token (enviado desde el navegador) a UsuarioToken.
        /// Si en el servidor ya tienen el usuario en sesión, reemplacen este método para leerlo de ahí.
        /// </summary>
        private static UsuarioToken LeerUsuario(string usuarioJson)
        {
            if (string.IsNullOrEmpty(usuarioJson)) { return new UsuarioToken(); }
            try
            {
                return Deserializar<UsuarioToken>(usuarioJson) ?? new UsuarioToken();
            }
            catch
            {
                return new UsuarioToken();
            }
        }
    }
}

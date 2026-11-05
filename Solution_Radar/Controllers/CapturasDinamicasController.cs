using System;
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
        // Para conectar la BD: cambia CapturaDinamicaRepositorioMock por tu implementación SQL.
        private readonly ICapturaDinamicaRepositorio _repositorio;

        public CapturasDinamicasController()
        {
            _repositorio = new CapturaDinamicaRepositorioMock();
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

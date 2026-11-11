using System.Collections.Generic;

namespace Solution_Radar.Models.ModuloDinamico
{
    // =====================================================================
    //  MÓDULO DE CAPTURA DINÁMICA (Encuestas dinámicas)
    //  Modelos / DTO que viajan entre el Controller y el JavaScript.
    //
    //  Equivalencia con las entidades propuestas y las tablas de BD:
    //    Survey            -> EncuestaEditor (datos de encuesta)  -> portal.capturadinamica_tp_encuesta
    //    SurveyVersion     -> EncuestaEditor (datos de versión)   -> portal.capturadinamica_tp_encuestaversion
    //    Question          -> Pregunta                            -> portal.capturadinamica_tp_pregunta
    //    QuestionType      -> CatalogoCapturaDinamica.Tipos       -> portal.capturadinamica_tc_tipopregunta
    //    QuestionOption    -> OpcionPregunta                      -> portal.capturadinamica_tp_preguntaopcion
    //    DependentOption   -> OpcionDependiente / NivelDependiente-> portal.capturadinamica_tp_opciondependiente / _tp_niveldependiente
    //    ConditionalRule   -> ReglaCondicional                    -> portal.capturadinamica_tp_reglacondicional
    //    SurveyResponse    -> RespuestaEncuesta                   -> portal.capturadinamica_tp_respuestaencuesta
    //    QuestionResponse  -> RespuestaPregunta                   -> portal.capturadinamica_tp_respuestapregunta
    //
    //  IMPORTANTE: Los nombres de propiedades se usan tal cual en JavaScript
    //  (PascalCase). Si cambias un nombre aquí, cámbialo también en los .js.
    // =====================================================================

    /// <summary>Catálogos fijos del módulo (mismos valores que las tablas tc_).</summary>
    public static class CatalogoCapturaDinamica
    {
        // Estatus de una versión / encuesta  (portal.capturadinamica_tc_estatus)
        public const string EstatusBorrador = "Borrador";
        public const string EstatusPublicada = "Publicada";
        public const string EstatusCerrada = "Cerrada";
        public const string EstatusArchivada = "Archivada";

        // Tipos de pregunta (portal.capturadinamica_tc_tipopregunta)
        public const string TipoUnica = "unica";
        public const string TipoMultiple = "multiple";
        public const string TipoTexto = "texto";
        public const string TipoSiNo = "sino";
        public const string TipoEscala = "escala";
        public const string TipoFecha = "fecha";
        public const string TipoNumero = "numero";
        public const string TipoDesplegable = "desplegable";
        public const string TipoMatriz = "matriz";
        public const string TipoDependiente = "dependiente";

        // Acciones de lógica condicional (portal.capturadinamica_tc_accionregla)
        public const string AccionMostrar = "mostrar";
        public const string AccionOcultar = "ocultar";
        public const string AccionIrA = "irA";
        public const string AccionFinalizar = "finalizar";

        // Clave reservada para la opción "Otro"
        public const string ClaveOtro = "__otro";
    }

    /// <summary>Respuesta estándar de todas las llamadas AJAX.</summary>
    public class ResultadoOperacion
    {
        public bool Exito { get; set; }
        public string Mensaje { get; set; }
        public object Datos { get; set; }

        public static ResultadoOperacion Ok(object datos, string mensaje)
        {
            return new ResultadoOperacion { Exito = true, Datos = datos, Mensaje = mensaje };
        }

        public static ResultadoOperacion Error(string mensaje)
        {
            return new ResultadoOperacion { Exito = false, Mensaje = mensaje };
        }
    }

    /// <summary>Datos del usuario tomados del objeto Token del portal.</summary>
    public class UsuarioToken
    {
        public string NumEmpleado { get; set; }
        public string NombreEmpleado { get; set; }
        public string Puesto { get; set; }
        public string Cencos { get; set; }
        public string CorreoNumEmpleado { get; set; }
        public string Nivel { get; set; }
    }

    /// <summary>Renglón del listado de encuestas (pantalla Administrador).</summary>
    public class EncuestaResumen
    {
        public int IdEncuesta { get; set; }
        public string Nombre { get; set; }
        public string Descripcion { get; set; }
        public string Estatus { get; set; }
        public int IdVersionVigente { get; set; }
        public int NumeroVersionVigente { get; set; }
        public int NumeroVersionUltima { get; set; }
        public string EstatusUltimaVersion { get; set; }
        public int TotalPreguntas { get; set; }
        public int TotalRespuestas { get; set; }
        public string FechaInicio { get; set; }
        public string FechaCierre { get; set; }
        public string FechaModificacion { get; set; }
        public string UsuarioModifica { get; set; }
    }

    /// <summary>Elemento del historial de versiones.</summary>
    public class VersionResumen
    {
        public int IdVersion { get; set; }
        public int NumeroVersion { get; set; }
        public string Estatus { get; set; }
        public string FechaCreacion { get; set; }
        public string FechaPublicacion { get; set; }
        public string UsuarioCrea { get; set; }
        public int TotalRespuestas { get; set; }
    }

    /// <summary>Configuración de publicación de una versión.</summary>
    public class PublicacionConfig
    {
        public string FechaInicio { get; set; }      // yyyy-MM-dd
        public string FechaCierre { get; set; }      // yyyy-MM-dd
        public bool RespuestaUnica { get; set; }     // true = una respuesta por usuario
        public bool Anonima { get; set; }
        public bool RequiereAutenticacion { get; set; }
        public string MensajeInicial { get; set; }
        public string MensajeFinal { get; set; }
    }

    /// <summary>Regla de segmentación: quién puede responder.</summary>
    public class SegmentoRegla
    {
        public string Clave { get; set; }
        public string Tipo { get; set; }   // Puesto | Segmento | Region | Sucursal | Usuario
        public string Valor { get; set; }
    }

    /// <summary>
    /// Encuesta + versión que se edita. Es el documento completo que
    /// usa el constructor (se guarda y se carga de una sola vez).
    /// </summary>
    public class EncuestaEditor
    {
        public int IdEncuesta { get; set; }
        public int IdVersion { get; set; }
        public int NumeroVersion { get; set; }
        public string Nombre { get; set; }
        public string Descripcion { get; set; }
        public string Estatus { get; set; }
        public int TotalRespuestas { get; set; }
        public int PoblacionObjetivo { get; set; }
        public string FechaCreacion { get; set; }
        public string FechaPublicacion { get; set; }
        public string UsuarioCrea { get; set; }

        public PublicacionConfig Publicacion { get; set; }
        public List<SegmentoRegla> Segmentacion { get; set; }
        public List<Pregunta> Preguntas { get; set; }
        public List<VersionResumen> Versiones { get; set; }

        public EncuestaEditor()
        {
            Publicacion = new PublicacionConfig();
            Segmentacion = new List<SegmentoRegla>();
            Preguntas = new List<Pregunta>();
            Versiones = new List<VersionResumen>();
        }
    }

    /// <summary>Pregunta (Question). Las propiedades opcionales aplican según el tipo.</summary>
    public class Pregunta
    {
        public string Clave { get; set; }          // identificador estable (no cambia entre versiones)
        public int Orden { get; set; }
        public string Tipo { get; set; }           // ver CatalogoCapturaDinamica.Tipo*
        public string Texto { get; set; }
        public string Descripcion { get; set; }
        public bool Obligatoria { get; set; }
        public bool OrdenAleatorio { get; set; }
        public bool PermitirOtro { get; set; }

        // Texto libre
        public bool TextoLargo { get; set; }
        public int? MinCaracteres { get; set; }
        public int? MaxCaracteres { get; set; }

        // Selección múltiple
        public int? MinSelecciones { get; set; }
        public int? MaxSelecciones { get; set; }

        // Número
        public decimal? ValorMinimo { get; set; }
        public decimal? ValorMaximo { get; set; }
        public bool PermitirDecimales { get; set; }

        // Escala
        public int? EscalaMinimo { get; set; }
        public int? EscalaMaximo { get; set; }
        public string EtiquetaMinimo { get; set; }
        public string EtiquetaMaximo { get; set; }

        // Fecha
        public string FechaMinima { get; set; }
        public string FechaMaxima { get; set; }

        // Fecha -> calendario de Outlook (archivo .ics al enviar)
        public bool PermitirCalendario { get; set; }
        public bool CalendarioPedirHora { get; set; }
        public string CalendarioTitulo { get; set; }       // vacío = texto de la pregunta
        public int? CalendarioDuracion { get; set; }       // minutos (solo si se captura hora)

        // Campo llave (solo texto o número; uno por encuesta).
        // Al capturarlo se busca la última captura con el mismo valor y se cargan sus respuestas.
        public bool EsLlave { get; set; }

        // Opción única / múltiple / desplegable / sí-no
        public List<OpcionPregunta> Opciones { get; set; }
        // Matriz
        public List<OpcionPregunta> Filas { get; set; }
        public List<OpcionPregunta> Columnas { get; set; }
        // Multiselección dependiente
        public List<NivelDependiente> Niveles { get; set; }
        public List<OpcionDependiente> OpcionesDependientes { get; set; }
        // Lógica condicional
        public List<ReglaCondicional> Reglas { get; set; }

        public Pregunta()
        {
            Opciones = new List<OpcionPregunta>();
            Filas = new List<OpcionPregunta>();
            Columnas = new List<OpcionPregunta>();
            Niveles = new List<NivelDependiente>();
            OpcionesDependientes = new List<OpcionDependiente>();
            Reglas = new List<ReglaCondicional>();
        }
    }

    /// <summary>Opción de respuesta, fila o columna de matriz (QuestionOption).</summary>
    public class OpcionPregunta
    {
        public string Clave { get; set; }
        public string Texto { get; set; }
    }

    /// <summary>Nivel de una multiselección dependiente (Banca / Producto / Recurso).</summary>
    public class NivelDependiente
    {
        public int Nivel { get; set; }
        public string Nombre { get; set; }
        public bool PermitirMultiple { get; set; }
    }

    /// <summary>Opción de un nivel dependiente; ClavePadre apunta a la opción del nivel anterior.</summary>
    public class OpcionDependiente
    {
        public string Clave { get; set; }
        public int Nivel { get; set; }
        public string ClavePadre { get; set; }
        public string Texto { get; set; }
    }

    /// <summary>
    /// Regla condicional: SI (respuesta Operador Valor) ENTONCES Accion ClaveDestino.
    /// Operador: igual | distinto | contiene | mayor | menor
    /// Accion:   mostrar | ocultar | irA | finalizar
    /// Valor:    clave de la opción (tipos con opciones) o valor literal (número / texto / fecha)
    /// </summary>
    public class ReglaCondicional
    {
        public string Clave { get; set; }
        public string Operador { get; set; }
        public string Valor { get; set; }
        public string Accion { get; set; }
        public string ClaveDestino { get; set; }
    }

    // ------------------------------------------------------------------
    //  RESPUESTAS (modelo dinámico: una fila por respuesta / opción)
    // ------------------------------------------------------------------

    /// <summary>Respuesta de un usuario a una versión de encuesta (SurveyResponse).</summary>
    public class RespuestaEncuesta
    {
        public int IdRespuesta { get; set; }
        public int IdEncuesta { get; set; }
        public int IdVersion { get; set; }
        public string NumEmpleado { get; set; }
        public string NombreEmpleado { get; set; }
        public string FechaRespuesta { get; set; }
        public List<RespuestaPregunta> Respuestas { get; set; }

        public RespuestaEncuesta()
        {
            Respuestas = new List<RespuestaPregunta>();
        }
    }

    /// <summary>
    /// Valor capturado para una pregunta (QuestionResponse).
    /// - Opción única / desplegable / sí-no: 1 fila con ClaveOpcion.
    /// - Selección múltiple / dependiente: 1 fila por opción seleccionada.
    /// - "Otro": ClaveOpcion = "__otro" y el texto en ValorTexto.
    /// - Matriz: 1 fila por renglón (ClaveFila) con la columna en ClaveOpcion.
    /// - Texto / número / escala / fecha: ValorTexto / ValorNumero / ValorFecha.
    /// </summary>
    public class RespuestaPregunta
    {
        public string ClavePregunta { get; set; }
        public string ClaveOpcion { get; set; }
        public string ClaveFila { get; set; }
        public string ValorTexto { get; set; }
        public decimal? ValorNumero { get; set; }
        public string ValorFecha { get; set; }
    }

    /// <summary>Información que necesita la pantalla de captura.</summary>
    public class CapturaInfo
    {
        public bool PuedeResponder { get; set; }
        public string Mensaje { get; set; }
        public EncuestaEditor Encuesta { get; set; }
    }

    /// <summary>Resultado de buscar la última captura por el valor del campo llave.</summary>
    public class BusquedaLlaveResultado
    {
        public bool Encontrada { get; set; }
        public int IdRespuesta { get; set; }
        public int NumeroVersion { get; set; }
        public string FechaRespuesta { get; set; }
        public string Usuario { get; set; }          // "Anónimo" si la encuesta es anónima
        public int TotalCapturas { get; set; }       // cuántas capturas hay con ese valor
        public List<RespuestaPregunta> Respuestas { get; set; }

        public BusquedaLlaveResultado()
        {
            Respuestas = new List<RespuestaPregunta>();
        }
    }

    /// <summary>Evento para el archivo de calendario (.ics).</summary>
    public class EventoCalendario
    {
        public string Titulo { get; set; }
        public string Descripcion { get; set; }
        public string Fecha { get; set; }       // yyyy-MM-dd
        public string Hora { get; set; }        // HH:mm o null = todo el día
        public int? Duracion { get; set; }      // minutos
    }

    /// <summary>Reglas comunes del campo llave.</summary>
    public static class CampoLlave
    {
        /// <summary>Pregunta llave de la versión (null si no tiene).</summary>
        public static Pregunta Obtener(EncuestaEditor e)
        {
            if (e == null || e.Preguntas == null) { return null; }
            foreach (var p in e.Preguntas)
            {
                if (p.EsLlave) { return p; }
            }
            return null;
        }

        /// <summary>Valor normalizado de la llave dentro de una respuesta (null si no la contestó).</summary>
        public static string Valor(RespuestaEncuesta r, string clavePregunta)
        {
            if (r == null || r.Respuestas == null || clavePregunta == null) { return null; }
            foreach (var rp in r.Respuestas)
            {
                if (rp.ClavePregunta != clavePregunta) { continue; }
                if (rp.ValorNumero.HasValue) { return Normalizar(rp.ValorNumero.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)); }
                return Normalizar(rp.ValorTexto);
            }
            return null;
        }

        /// <summary>Quita espacios y ceros decimales sobrantes y pasa a mayúsculas para comparar.</summary>
        public static string Normalizar(string valor)
        {
            if (string.IsNullOrWhiteSpace(valor)) { return null; }
            string v = valor.Trim();
            decimal d;
            if (decimal.TryParse(v, System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out d))
            {
                return d.ToString("0.############", System.Globalization.CultureInfo.InvariantCulture);
            }
            return v.ToUpperInvariant();
        }
    }
}

using System.Collections.Generic;
using Solution_Radar.Models.ModuloDinamico;

namespace Solution_Radar.DataAccess.CapturasDinamicas
{
    /// <summary>
    /// Contrato de acceso a datos del módulo de Captura Dinámica.
    ///
    /// Hoy lo implementa CapturaDinamicaRepositorioMock (datos en memoria).
    /// Para conectar la base de datos crea "CapturaDinamicaRepositorioSql"
    /// que implemente esta misma interfaz (usando los stored procedures o
    /// consultas sobre las tablas portal.capturadinamica_*) y cámbialo en
    /// el constructor de CapturasDinamicasController. El JavaScript y las
    /// vistas no cambian.
    /// </summary>
    public interface ICapturaDinamicaRepositorio
    {
        /// <summary>Listado para la pantalla del administrador.</summary>
        List<EncuestaResumen> ListarEncuestas();

        /// <summary>Obtiene una encuesta para el constructor. Si idVersion es null regresa la última versión.</summary>
        EncuestaEditor ObtenerEncuesta(int idEncuesta, int? idVersion);

        /// <summary>Crea una encuesta nueva con su versión 1 en Borrador.</summary>
        EncuestaEditor CrearEncuesta(string nombre, string descripcion, UsuarioToken usuario);

        /// <summary>
        /// Guarda la versión como borrador. Regla de versionado:
        /// si la versión está publicada/cerrada y ya tiene respuestas, NO se sobrescribe:
        /// se crea una versión nueva en Borrador y se conserva la anterior.
        /// </summary>
        ResultadoOperacion GuardarBorrador(EncuestaEditor encuesta, UsuarioToken usuario);

        /// <summary>Guarda y publica. La versión publicada anterior pasa a Archivada (histórico).</summary>
        ResultadoOperacion Publicar(EncuestaEditor encuesta, UsuarioToken usuario);

        /// <summary>Cambia el estatus de la versión vigente (Cerrada / Archivada / Publicada).</summary>
        ResultadoOperacion CambiarEstatus(int idEncuesta, string estatus, UsuarioToken usuario);

        /// <summary>Resultados de una versión. Si idVersion es null usa la última versión con respuestas.</summary>
        ResultadosEncuesta ObtenerResultados(int idEncuesta, int? idVersion);

        /// <summary>Encuesta publicada vigente para que el usuario la conteste.</summary>
        CapturaInfo ObtenerCaptura(int idEncuesta, UsuarioToken usuario);

        /// <summary>Guarda la respuesta del usuario.</summary>
        ResultadoOperacion GuardarRespuesta(RespuestaEncuesta respuesta, UsuarioToken usuario);

        /// <summary>
        /// Busca en todas las versiones de la encuesta la ÚLTIMA captura cuyo campo llave
        /// (pregunta con clave clavePregunta) tenga el valor indicado.
        /// </summary>
        BusquedaLlaveResultado BuscarPorLlave(int idEncuesta, string clavePregunta, string valor);
    }

    /// <summary>Datos de ejemplo de una encuesta (para sembrar una base de pruebas).</summary>
    public class SemillaEncuesta
    {
        public string Nombre { get; set; }
        public string Descripcion { get; set; }
        public string UsuarioModifica { get; set; }
        public List<EncuestaEditor> Versiones { get; set; }          // ordenadas por NumeroVersion
        public List<RespuestaEncuesta> Respuestas { get; set; }       // IdVersion = id de la versión en la semilla
    }
}

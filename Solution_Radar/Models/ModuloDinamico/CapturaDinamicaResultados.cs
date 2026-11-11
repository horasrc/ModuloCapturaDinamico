using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Solution_Radar.Models.ModuloDinamico
{
    // =====================================================================
    //  RESULTADOS de una versión de encuesta.
    //  CapturaDinamicaResultadosServicio calcula los resultados a partir de
    //  la definición (EncuestaEditor) y la lista de respuestas. Cuando se
    //  conecte la BD se puede seguir usando este servicio, o bien sustituirlo
    //  por consultas agregadas (GROUP BY) en SQL.
    // =====================================================================

    public class ResultadosEncuesta
    {
        public int IdEncuesta { get; set; }
        public int IdVersion { get; set; }
        public int NumeroVersion { get; set; }
        public string Nombre { get; set; }
        public bool Anonima { get; set; }
        public int TotalRespuestas { get; set; }
        public int PoblacionObjetivo { get; set; }
        public decimal TasaRespuesta { get; set; }
        public int Pendientes { get; set; }
        public string FechaInicio { get; set; }
        public string FechaCierre { get; set; }
        public bool ConCampoLlave { get; set; }           // true = solo cuenta la última captura de cada llave
        public string TextoCampoLlave { get; set; }
        public int CapturasTotales { get; set; }          // capturas antes de quitar repetidas por llave
        public List<VersionResumen> VersionesConRespuestas { get; set; }
        public List<ResultadoPregunta> Preguntas { get; set; }

        public ResultadosEncuesta()
        {
            VersionesConRespuestas = new List<VersionResumen>();
            Preguntas = new List<ResultadoPregunta>();
        }
    }

    public class ResultadoPregunta
    {
        public string Clave { get; set; }
        public int Numero { get; set; }
        public string Texto { get; set; }
        public string Tipo { get; set; }
        public int TotalRespondieron { get; set; }
        public List<ResultadoOpcion> Opciones { get; set; }
        public List<ResultadoTexto> Textos { get; set; }
        public List<string> Columnas { get; set; }
        public List<ResultadoFilaMatriz> Filas { get; set; }
        public List<ResultadoNivel> Niveles { get; set; }
        public ResultadoNumerico Numerico { get; set; }

        public ResultadoPregunta()
        {
            Opciones = new List<ResultadoOpcion>();
            Textos = new List<ResultadoTexto>();
            Columnas = new List<string>();
            Filas = new List<ResultadoFilaMatriz>();
            Niveles = new List<ResultadoNivel>();
        }
    }

    public class ResultadoOpcion
    {
        public string Clave { get; set; }
        public string Texto { get; set; }
        public int Conteo { get; set; }
        public decimal Porcentaje { get; set; }
    }

    public class ResultadoTexto
    {
        public string Texto { get; set; }
        public string Fecha { get; set; }
        public string Usuario { get; set; }
    }

    public class ResultadoFilaMatriz
    {
        public string Texto { get; set; }
        public int Total { get; set; }
        public List<ResultadoOpcion> Celdas { get; set; }

        public ResultadoFilaMatriz()
        {
            Celdas = new List<ResultadoOpcion>();
        }
    }

    public class ResultadoNivel
    {
        public string Nombre { get; set; }
        public List<ResultadoOpcion> Opciones { get; set; }

        public ResultadoNivel()
        {
            Opciones = new List<ResultadoOpcion>();
        }
    }

    public class ResultadoNumerico
    {
        public decimal Promedio { get; set; }
        public decimal Minimo { get; set; }
        public decimal Maximo { get; set; }
    }

    /// <summary>Calcula los resultados agregados por tipo de pregunta.</summary>
    public static class CapturaDinamicaResultadosServicio
    {
        public static ResultadosEncuesta Calcular(EncuestaEditor def, List<RespuestaEncuesta> respuestas)
        {
            var res = new ResultadosEncuesta();
            res.IdEncuesta = def.IdEncuesta;
            res.IdVersion = def.IdVersion;
            res.NumeroVersion = def.NumeroVersion;
            res.Nombre = def.Nombre;
            res.Anonima = def.Publicacion != null && def.Publicacion.Anonima;
            res.FechaInicio = def.Publicacion != null ? def.Publicacion.FechaInicio : null;
            res.FechaCierre = def.Publicacion != null ? def.Publicacion.FechaCierre : null;
            res.CapturasTotales = respuestas.Count;

            // Con campo llave: solo la última captura de cada valor (las anteriores son historial)
            var llave = CampoLlave.Obtener(def);
            if (llave != null)
            {
                res.ConCampoLlave = true;
                res.TextoCampoLlave = llave.Texto;
                var sinLlave = respuestas.Where(r => CampoLlave.Valor(r, llave.Clave) == null);
                var ultimas = respuestas.Where(r => CampoLlave.Valor(r, llave.Clave) != null)
                                        .GroupBy(r => CampoLlave.Valor(r, llave.Clave))
                                        .Select(g => g.OrderByDescending(r => r.IdRespuesta).First());
                respuestas = ultimas.Concat(sinLlave).ToList();
            }
            res.TotalRespuestas = respuestas.Count;
            res.PoblacionObjetivo = def.PoblacionObjetivo;

            int usuariosDistintos = respuestas.Select(r => r.NumEmpleado).Distinct().Count();
            res.Pendientes = Math.Max(0, def.PoblacionObjetivo - usuariosDistintos);
            res.TasaRespuesta = def.PoblacionObjetivo > 0
                ? Math.Round(usuariosDistintos * 100m / def.PoblacionObjetivo, 1)
                : 0m;

            int numero = 0;
            foreach (var p in def.Preguntas.OrderBy(x => x.Orden))
            {
                numero++;
                res.Preguntas.Add(CalcularPregunta(p, numero, respuestas, res.Anonima));
            }
            return res;
        }

        private static ResultadoPregunta CalcularPregunta(Pregunta p, int numero, List<RespuestaEncuesta> respuestas, bool anonima)
        {
            var r = new ResultadoPregunta();
            r.Clave = p.Clave;
            r.Numero = numero;
            r.Texto = p.Texto;
            r.Tipo = p.Tipo;

            // Todas las filas de respuesta de esta pregunta, con su encabezado
            var filas = new List<KeyValuePair<RespuestaEncuesta, RespuestaPregunta>>();
            foreach (var enc in respuestas)
            {
                foreach (var rp in enc.Respuestas)
                {
                    if (rp.ClavePregunta == p.Clave)
                    {
                        filas.Add(new KeyValuePair<RespuestaEncuesta, RespuestaPregunta>(enc, rp));
                    }
                }
            }
            r.TotalRespondieron = filas.Select(f => f.Key.IdRespuesta).Distinct().Count();
            int total = r.TotalRespondieron;

            switch (p.Tipo)
            {
                case CatalogoCapturaDinamica.TipoUnica:
                case CatalogoCapturaDinamica.TipoMultiple:
                case CatalogoCapturaDinamica.TipoDesplegable:
                case CatalogoCapturaDinamica.TipoSiNo:
                    foreach (var o in p.Opciones)
                    {
                        int c = filas.Count(f => f.Value.ClaveOpcion == o.Clave);
                        r.Opciones.Add(NuevaOpcion(o.Clave, o.Texto, c, total));
                    }
                    if (p.PermitirOtro)
                    {
                        var otros = filas.Where(f => f.Value.ClaveOpcion == CatalogoCapturaDinamica.ClaveOtro).ToList();
                        r.Opciones.Add(NuevaOpcion(CatalogoCapturaDinamica.ClaveOtro, "Otro", otros.Count, total));
                        foreach (var f in otros)
                        {
                            r.Textos.Add(NuevoTexto(f.Value.ValorTexto, f.Key, anonima));
                        }
                    }
                    break;

                case CatalogoCapturaDinamica.TipoEscala:
                    int min = p.EscalaMinimo ?? 1;
                    int max = p.EscalaMaximo ?? 5;
                    for (int v = min; v <= max; v++)
                    {
                        int valor = v;
                        int c = filas.Count(f => f.Value.ValorNumero.HasValue && f.Value.ValorNumero.Value == valor);
                        r.Opciones.Add(NuevaOpcion(v.ToString(), v.ToString(), c, total));
                    }
                    r.Numerico = CalcularNumerico(filas);
                    break;

                case CatalogoCapturaDinamica.TipoNumero:
                    r.Numerico = CalcularNumerico(filas);
                    break;

                case CatalogoCapturaDinamica.TipoFecha:
                    foreach (var g in filas.Where(f => !string.IsNullOrEmpty(f.Value.ValorFecha))
                                           .GroupBy(f => f.Value.ValorFecha)
                                           .OrderBy(g => g.Key))
                    {
                        DateTime f;
                        string texto = DateTime.TryParseExact(g.Key, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out f)
                            ? f.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture) : g.Key;
                        r.Opciones.Add(NuevaOpcion(g.Key, texto, g.Count(), total));
                    }
                    break;

                case CatalogoCapturaDinamica.TipoTexto:
                    foreach (var f in filas.Where(x => !string.IsNullOrEmpty(x.Value.ValorTexto)))
                    {
                        r.Textos.Add(NuevoTexto(f.Value.ValorTexto, f.Key, anonima));
                    }
                    break;

                case CatalogoCapturaDinamica.TipoMatriz:
                    foreach (var col in p.Columnas)
                    {
                        r.Columnas.Add(col.Texto);
                    }
                    foreach (var fila in p.Filas)
                    {
                        var rf = new ResultadoFilaMatriz();
                        rf.Texto = fila.Texto;
                        var deFila = filas.Where(f => f.Value.ClaveFila == fila.Clave).ToList();
                        rf.Total = deFila.Count;
                        foreach (var col in p.Columnas)
                        {
                            int c = deFila.Count(f => f.Value.ClaveOpcion == col.Clave);
                            rf.Celdas.Add(NuevaOpcion(col.Clave, col.Texto, c, rf.Total));
                        }
                        r.Filas.Add(rf);
                    }
                    break;

                case CatalogoCapturaDinamica.TipoDependiente:
                    foreach (var nivel in p.Niveles.OrderBy(n => n.Nivel))
                    {
                        var rn = new ResultadoNivel();
                        rn.Nombre = nivel.Nombre;
                        foreach (var od in p.OpcionesDependientes.Where(o => o.Nivel == nivel.Nivel))
                        {
                            string clave = od.Clave;
                            int c = filas.Count(f => f.Value.ClaveOpcion == clave);
                            if (c == 0) { continue; }
                            rn.Opciones.Add(NuevaOpcion(od.Clave, TextoConPadre(p, od), c, total));
                        }
                        rn.Opciones = rn.Opciones.OrderByDescending(o => o.Conteo).ToList();
                        r.Niveles.Add(rn);
                    }
                    break;
            }
            return r;
        }

        private static string TextoConPadre(Pregunta p, OpcionDependiente od)
        {
            if (string.IsNullOrEmpty(od.ClavePadre)) { return od.Texto; }
            var padre = p.OpcionesDependientes.FirstOrDefault(x => x.Clave == od.ClavePadre);
            return padre == null ? od.Texto : padre.Texto + " › " + od.Texto;
        }

        private static ResultadoNumerico CalcularNumerico(List<KeyValuePair<RespuestaEncuesta, RespuestaPregunta>> filas)
        {
            var valores = filas.Where(f => f.Value.ValorNumero.HasValue).Select(f => f.Value.ValorNumero.Value).ToList();
            if (valores.Count == 0) { return null; }
            return new ResultadoNumerico
            {
                Promedio = Math.Round(valores.Average(), 2),
                Minimo = valores.Min(),
                Maximo = valores.Max()
            };
        }

        private static ResultadoOpcion NuevaOpcion(string clave, string texto, int conteo, int total)
        {
            return new ResultadoOpcion
            {
                Clave = clave,
                Texto = texto,
                Conteo = conteo,
                Porcentaje = total > 0 ? Math.Round(conteo * 100m / total, 1) : 0m
            };
        }

        private static ResultadoTexto NuevoTexto(string texto, RespuestaEncuesta enc, bool anonima)
        {
            return new ResultadoTexto
            {
                Texto = texto,
                Fecha = enc.FechaRespuesta,
                Usuario = anonima ? "Anónimo" : enc.NombreEmpleado
            };
        }

        /// <summary>Fecha actual en formato yyyy-MM-dd (formato que usa todo el módulo).</summary>
        public static string Hoy()
        {
            return DateTime.Today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        }
    }
}

/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Resultados (cd.resultados.js)

   Pinta la pestaña "Resultados" del editor con la información que
   regresa el servidor (modelo C# ResultadosEncuesta):
     - Indicadores: total, tasa de respuesta, pendientes, fechas.
     - Opción única / Sí-No / Desplegable / Escala: conteo, % y barras.
     - Selección múltiple: conteo y % por opción (+ textos de "Otro").
     - Texto libre: lista de respuestas con buscador.
     - Matriz: resumen por fila y columna.
     - Número: promedio, mínimo y máximo.
     - Dependiente: conteo por nivel.
   ===================================================================== */

(function (CD) {
    'use strict';

    var util = CD.util;
    var $ = jQuery;
    var datos = null;

    function cargar(idEncuesta, idVersion) {
        var $c = $('#cdResultadosContenido');
        CD.ui.cargando($c, 'Calculando resultados...');
        CD.api.obtenerResultados(idEncuesta, idVersion)
            .done(function (res) {
                datos = res;
                render($c, res);
            })
            .fail(function (msg) {
                $c.html('<div class="cd-card"><div class="cd-card-body text-cd-red">' + util.esc(msg) + '</div></div>');
            });
    }

    function render($c, res) {
        // Selector de versión (solo versiones con respuestas)
        var $sel = $('#cdResVersion');
        var opciones = '';
        for (var v = 0; v < res.VersionesConRespuestas.length; v++) {
            var ver = res.VersionesConRespuestas[v];
            opciones += '<option value="' + ver.IdVersion + '"' + (ver.IdVersion === res.IdVersion ? ' selected' : '') + '>Versión ' +
                ver.NumeroVersion + ' · ' + ver.Estatus + ' (' + ver.TotalRespuestas + ')</option>';
        }
        $sel.html(opciones || '<option value="">Versión ' + res.NumeroVersion + ' (sin respuestas)</option>');

        var html = '';
        html += '<div class="row g-3 mb-3">' +
            kpi(res.TotalRespuestas, 'Total de respuestas', 'bi-people') +
            kpi(res.TasaRespuesta + '%', 'Tasa de respuesta (' + res.PoblacionObjetivo + ' usuarios objetivo)', 'bi-graph-up') +
            kpi(res.Pendientes, 'Respuestas pendientes', 'bi-hourglass-split') +
            kpi(util.fecha(res.FechaInicio) || '—', 'Fecha de inicio', 'bi-calendar') +
            kpi(util.fecha(res.FechaCierre) || '—', 'Fecha de cierre', 'bi-calendar-check') +
            '</div>';

        if (res.ConCampoLlave) {
            html += '<div class="cd-llave-aviso encontrada mb-3" style="max-width:none"><i class="bi bi-key me-1"></i>' +
                'Encuesta con campo llave (<strong>' + util.esc(res.TextoCampoLlave) + '</strong>): los resultados toman solo la ' +
                '<strong>última captura de cada valor</strong>. ' + res.TotalRespuestas + ' registros únicos de ' +
                res.CapturasTotales + ' capturas en total.</div>';
        }

        if (res.TotalRespuestas === 0) {
            html += '<div class="cd-card"><div class="cd-vacio"><i class="bi bi-bar-chart"></i>Esta versión todavía no tiene respuestas.</div></div>';
            $c.html(html);
            return;
        }

        for (var i = 0; i < res.Preguntas.length; i++) {
            html += tarjetaPregunta(res.Preguntas[i], res.TotalRespuestas);
        }
        $c.html(html);

        // Buscador de textos libres
        $c.off('input.cdres').on('input.cdres', '[data-cd-buscar]', function () {
            var texto = this.value.toLowerCase();
            var $lista = $(this).closest('.cd-card').find('.cd-res-texto');
            var visibles = 0;
            $lista.each(function () {
                var coincide = $(this).text().toLowerCase().indexOf(texto) >= 0;
                $(this).toggleClass('cd-oculto', !coincide);
                if (coincide) { visibles++; }
            });
            $(this).closest('.cd-card').find('.cd-res-conteo').text(visibles + ' respuesta(s)');
        });
    }

    function kpi(valor, etiqueta, icono) {
        return '<div class="col-6 col-md-4 col-xl"><div class="cd-kpi"><div class="small text-cd-muted mb-1"><i class="bi ' + icono + '"></i></div>' +
            '<div class="cd-kpi-valor">' + util.esc(valor) + '</div><div class="cd-kpi-etiqueta">' + util.esc(etiqueta) + '</div></div></div>';
    }

    function tarjetaPregunta(p, total) {
        var t = CD.tipo(p.Tipo);
        var cuerpo = '';
        switch (p.Tipo) {
            case 'unica':
            case 'sino':
            case 'desplegable':
            case 'escala':
            case 'fecha':
                cuerpo = barras(p.Opciones, false);
                if (p.Numerico) { cuerpo += numerico(p.Numerico); }
                if (p.Textos.length) { cuerpo += listaTextos(p.Textos, 'Respuestas en «Otro»'); }
                break;
            case 'multiple':
                cuerpo = '<div class="small text-cd-muted mb-2">El porcentaje se calcula sobre quienes respondieron la pregunta (pueden elegir varias opciones).</div>' +
                    barras(p.Opciones, true);
                if (p.Textos.length) { cuerpo += listaTextos(p.Textos, 'Respuestas en «Otro»'); }
                break;
            case 'numero':
                cuerpo = p.Numerico ? numerico(p.Numerico) : '<div class="text-cd-muted small">Sin respuestas.</div>';
                break;
            case 'texto':
                cuerpo = listaTextos(p.Textos, null);
                break;
            case 'matriz':
                cuerpo = matriz(p);
                break;
            case 'dependiente':
                for (var i = 0; i < p.Niveles.length; i++) {
                    cuerpo += '<div class="cd-subtitulo">' + util.esc(p.Niveles[i].Nombre) + '</div>' + barras(p.Niveles[i].Opciones, true);
                }
                break;
        }
        return '<div class="cd-card"><div class="cd-card-header"><span><span class="cd-num rojo me-2">' + p.Numero + '</span>' + util.esc(p.Texto) + '</span>' +
            '<span class="small text-cd-muted fw-normal text-nowrap ms-2"><i class="bi ' + t.icono + ' me-1"></i>' + t.nombre + ' · ' +
            p.TotalRespondieron + ' de ' + total + '</span></div><div class="cd-card-body">' + cuerpo + '</div></div>';
    }

    /** Gráfica de barras horizontal hecha con CSS (sin librerías). */
    function barras(opciones, negro) {
        if (!opciones || !opciones.length) { return '<div class="text-cd-muted small">Sin respuestas.</div>'; }
        var max = 0;
        var i;
        for (i = 0; i < opciones.length; i++) { if (opciones[i].Porcentaje > max) { max = opciones[i].Porcentaje; } }
        var html = '';
        for (i = 0; i < opciones.length; i++) {
            var o = opciones[i];
            var ancho = max > 0 ? Math.round(o.Porcentaje * 100 / max) : 0;
            html += '<div class="cd-barra-fila"><div class="cd-barra-texto">' + util.esc(o.Texto) + '</div>' +
                '<div class="cd-barra-pista"><div class="cd-barra-valor' + (negro ? ' negro' : '') + '" style="width:' + ancho + '%"></div></div>' +
                '<div class="cd-barra-num"><strong>' + o.Conteo + '</strong> · ' + o.Porcentaje + '%</div></div>';
        }
        return html;
    }

    function numerico(n) {
        return '<div class="row g-2 mt-1">' +
            '<div class="col-4"><div class="cd-kpi"><div class="cd-kpi-valor">' + n.Promedio + '</div><div class="cd-kpi-etiqueta">Promedio</div></div></div>' +
            '<div class="col-4"><div class="cd-kpi"><div class="cd-kpi-valor">' + n.Minimo + '</div><div class="cd-kpi-etiqueta">Mínimo</div></div></div>' +
            '<div class="col-4"><div class="cd-kpi"><div class="cd-kpi-valor">' + n.Maximo + '</div><div class="cd-kpi-etiqueta">Máximo</div></div></div></div>';
    }

    function listaTextos(textos, titulo) {
        var html = (titulo ? '<div class="cd-subtitulo mt-3">' + titulo + '</div>' : '') +
            '<div class="d-flex align-items-center mb-2"><div class="input-group input-group-sm" style="max-width:340px">' +
            '<span class="input-group-text bg-white"><i class="bi bi-search"></i></span>' +
            '<input type="text" class="form-control" placeholder="Buscar en respuestas" data-cd-buscar="1"></div>' +
            '<span class="small text-cd-muted ms-3 cd-res-conteo">' + textos.length + ' respuesta(s)</span></div><div class="cd-res-textos">';
        for (var i = 0; i < textos.length; i++) {
            html += '<div class="cd-res-texto">' + util.esc(textos[i].Texto) + '<br><small>' + util.esc(textos[i].Usuario) + ' · ' + util.fecha(textos[i].Fecha) + '</small></div>';
        }
        return html + '</div>';
    }

    /** Tabla de matriz: conteo y % por celda, con intensidad de color según el %. */
    function matriz(p) {
        var html = '<div class="cd-matriz-scroll"><table class="table table-sm cd-heat mb-0"><thead><tr><th></th>';
        var i, j;
        for (j = 0; j < p.Columnas.length; j++) { html += '<th class="text-center small">' + util.esc(p.Columnas[j]) + '</th>'; }
        html += '<th class="text-center small">Total</th></tr></thead><tbody>';
        for (i = 0; i < p.Filas.length; i++) {
            var f = p.Filas[i];
            html += '<tr><td>' + util.esc(f.Texto) + '</td>';
            for (j = 0; j < f.Celdas.length; j++) {
                var c = f.Celdas[j];
                var alfa = (c.Porcentaje / 100 * 0.85 + 0.05).toFixed(2);
                var claro = c.Porcentaje < 45;
                html += '<td class="celda" style="background:rgba(219,0,17,' + alfa + ');color:' + (claro ? '#1d1d1f' : '#fff') + '">' +
                    c.Conteo + '<div class="small fw-normal">' + c.Porcentaje + '%</div></td>';
            }
            html += '<td class="text-center">' + f.Total + '</td></tr>';
        }
        return html + '</tbody></table></div>';
    }

    CD.Resultados = {
        cargar: cargar,
        datos: function () { return datos; }
    };

})(window.CD);

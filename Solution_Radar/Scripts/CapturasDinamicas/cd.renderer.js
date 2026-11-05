/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Renderizador de encuestas (cd.renderer.js)

   Dibuja la encuesta tal como la ve quien responde. Se usa en:
     - La "Vista previa" del administrador (modo 'preview').
     - La vista previa de una sola pregunta en el constructor (soloPreguntas).
     - La pantalla real de captura (modo 'captura').

   Responsabilidades:
     1. Pintar cada tipo de pregunta.
     2. Guardar en memoria lo que el usuario contesta (this.respuestas).
     3. Aplicar la LÓGICA CONDICIONAL (mostrar / ocultar / ir a / finalizar).
     4. Validar (obligatorias, mín/máx de caracteres, selecciones, números...).
     5. Armar el paquete de respuestas para el servidor (modelo dinámico).

   Uso:
     var r = new CD.Renderer($('#contenedor'), encuesta, {
         modo: 'captura',               // 'preview' | 'captura'
         dispositivo: 'desktop',        // 'desktop' | 'tablet' | 'movil'
         alEnviar: function (respuestas, renderer) { ... }
     });
     r.render();
   ===================================================================== */

(function (CD) {
    'use strict';

    var util = CD.util;
    var OTRO = CD.CLAVE_OTRO;

    function Renderer($contenedor, encuesta, opciones) {
        this.$c = $contenedor;
        this.encuesta = encuesta;
        this.op = opciones || {};
        this.op.modo = this.op.modo || 'preview';
        this.op.dispositivo = this.op.dispositivo || 'desktop';
        this.respuestas = {};     // clavePregunta -> objeto respuesta
        this.ordenes = {};        // clavePregunta -> opciones en el orden a mostrar
        this.mapa = {};           // clavePregunta -> pregunta
        this.enviado = false;
    }

    // ==================================================================
    //  RENDER GENERAL
    // ==================================================================
    Renderer.prototype.render = function () {
        var e = this.encuesta;
        var preguntas = e.Preguntas || [];
        var html = [];
        var i;

        this.mapa = {};
        this.ordenes = {};
        for (i = 0; i < preguntas.length; i++) {
            var p = preguntas[i];
            this.mapa[p.Clave] = p;
            var ops = p.Opciones || [];
            this.ordenes[p.Clave] = (p.OrdenAleatorio && p.Tipo !== 'sino') ? util.mezclar(ops) : ops;
        }

        if (!this.op.soloPreguntas) {
            if (this.op.modo === 'preview') {
                html.push('<div class="cd-preview-aviso"><i class="bi bi-eye me-1"></i>Vista previa · las respuestas no se guardan</div>');
            }
            html.push(this.htmlPortada());
        }

        if (preguntas.length === 0) {
            html.push('<div class="cd-form-pregunta text-center text-cd-muted">La encuesta todavía no tiene preguntas.</div>');
        }

        for (i = 0; i < preguntas.length; i++) {
            html.push(this.htmlPregunta(preguntas[i], (this.op.numeroBase || 0) + i + 1));
        }

        if (!this.op.soloPreguntas && preguntas.length > 0) {
            html.push('<div class="cd-finaliza-aviso cd-oculto"><i class="bi bi-flag me-1"></i>' +
                'Según tus respuestas la encuesta termina aquí. Puedes enviarla.</div>');
            html.push('<div class="text-end mb-4"><button type="button" class="btn btn-cd-rojo px-4 cd-enviar">' +
                '<i class="bi bi-send me-1"></i>Enviar respuestas</button></div>');
        }

        this.$c.html('<div class="cd-form">' + html.join('') + '</div>');
        this.enlazarEventos();
        this.actualizar();
    };

    Renderer.prototype.htmlPortada = function () {
        var e = this.encuesta;
        var pub = e.Publicacion || {};
        var meta = [];
        if (pub.Anonima) { meta.push('<span><i class="bi bi-incognito me-1"></i>Respuestas anónimas</span>'); }
        if (pub.FechaCierre) { meta.push('<span><i class="bi bi-calendar-check me-1"></i>Disponible hasta ' + util.fecha(pub.FechaCierre) + '</span>'); }
        return '<div class="cd-form-portada">' +
            '<h2>' + util.esc(e.Nombre) + '</h2>' +
            (pub.MensajeInicial ? '<div>' + util.esc(pub.MensajeInicial) + '</div>' : '') +
            (meta.length ? '<div class="cd-form-meta">' + meta.join('') + '</div>' : '') +
            '<div class="cd-progreso"><div class="cd-progreso-barra"></div></div>' +
            '<div class="cd-form-meta cd-progreso-texto"></div>' +
            '</div>';
    };

    Renderer.prototype.htmlPregunta = function (p, numero) {
        return '<div class="cd-form-pregunta" data-cd-pregunta="' + util.esc(p.Clave) + '">' +
            '<div class="cd-form-titulo"><span class="cd-num rojo">' + numero + '</span><span>' +
            (util.vacio(p.Texto) ? '<span class="text-cd-muted">(Pregunta sin texto)</span>' : util.esc(p.Texto)) +
            (p.Obligatoria ? '<span class="cd-requerido">*</span>' : '') + '</span></div>' +
            (p.Descripcion ? '<div class="cd-form-desc">' + util.esc(p.Descripcion) + '</div>' : this.htmlAyuda(p)) +
            '<div class="cd-form-control">' + this.htmlControl(p) + '</div>' +
            '<div class="cd-form-error"></div>' +
            '</div>';
    };

    /** Texto de ayuda automático cuando la pregunta no tiene descripción. */
    Renderer.prototype.htmlAyuda = function (p) {
        var t = '';
        if (p.Tipo === 'multiple') {
            if (p.MinSelecciones && p.MaxSelecciones) { t = 'Elige de ' + p.MinSelecciones + ' a ' + p.MaxSelecciones + ' opciones.'; }
            else if (p.MaxSelecciones) { t = 'Elige hasta ' + p.MaxSelecciones + ' opciones.'; }
            else if (p.MinSelecciones) { t = 'Elige al menos ' + p.MinSelecciones + ' opciones.'; }
            else { t = 'Puedes elegir varias opciones.'; }
        } else if (p.Tipo === 'matriz') {
            t = 'Selecciona una opción por fila.';
        }
        return t ? '<div class="cd-form-desc">' + t + '</div>' : '';
    };

    // ==================================================================
    //  CONTROLES POR TIPO
    // ==================================================================
    Renderer.prototype.htmlControl = function (p) {
        switch (p.Tipo) {
            case 'unica': return this.htmlOpciones(p, 'radio');
            case 'multiple': return this.htmlOpciones(p, 'checkbox');
            case 'sino': return this.htmlSiNo(p);
            case 'desplegable': return this.htmlDesplegable(p);
            case 'texto': return this.htmlTexto(p);
            case 'escala': return this.htmlEscala(p);
            case 'fecha': return this.htmlFecha(p);
            case 'numero': return this.htmlNumero(p);
            case 'matriz': return this.htmlMatriz(p);
            case 'dependiente': return this.htmlDependiente(p);
        }
        return '<div class="text-cd-muted">Tipo de pregunta no soportado.</div>';
    };

    Renderer.prototype.nombreGrupo = function (p) {
        // El prefijo evita choques si hay dos renderers en la misma página
        return 'cd_' + (this.op.prefijo || 'r') + '_' + p.Clave;
    };

    Renderer.prototype.htmlOpciones = function (p, tipoInput) {
        var r = this.respuestas[p.Clave] || {};
        var ops = this.ordenes[p.Clave] || [];
        var html = [];
        var nombre = this.nombreGrupo(p);
        for (var i = 0; i < ops.length; i++) {
            var marcada = tipoInput === 'radio' ? r.opcion === ops[i].Clave : util.contiene(r.opciones, ops[i].Clave);
            html.push('<label class="cd-opcion-resp' + (marcada ? ' marcada' : '') + '">' +
                '<input class="form-check-input" type="' + tipoInput + '" name="' + nombre + '" value="' + util.esc(ops[i].Clave) +
                '" data-cd-q="' + util.esc(p.Clave) + '"' + (marcada ? ' checked' : '') + '>' +
                '<span>' + util.esc(ops[i].Texto) + '</span></label>');
        }
        if (p.PermitirOtro && CD.tipo(p.Tipo).permiteOtro) {
            var otroMarcado = tipoInput === 'radio' ? r.opcion === OTRO : util.contiene(r.opciones, OTRO);
            html.push('<label class="cd-opcion-resp' + (otroMarcado ? ' marcada' : '') + '">' +
                '<input class="form-check-input" type="' + tipoInput + '" name="' + nombre + '" value="' + OTRO +
                '" data-cd-q="' + util.esc(p.Clave) + '"' + (otroMarcado ? ' checked' : '') + '>' +
                '<span>Otro</span></label>');
            html.push('<input type="text" class="form-control mb-2 cd-otro-texto' + (otroMarcado ? '' : ' cd-oculto') +
                '" maxlength="200" placeholder="Especifica..." data-cd-q="' + util.esc(p.Clave) + '" value="' + util.esc(r.otro) + '">');
        }
        if (ops.length === 0) { html.push('<div class="text-cd-muted small">Sin opciones configuradas.</div>'); }
        return html.join('');
    };

    Renderer.prototype.htmlSiNo = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var ops = p.Opciones || [];
        var nombre = this.nombreGrupo(p);
        var html = '<div class="row g-2" style="max-width:420px">';
        for (var i = 0; i < ops.length; i++) {
            var marcada = r.opcion === ops[i].Clave;
            html += '<div class="col-6"><label class="cd-opcion-resp mb-0' + (marcada ? ' marcada' : '') + '">' +
                '<input class="form-check-input" type="radio" name="' + nombre + '" value="' + util.esc(ops[i].Clave) +
                '" data-cd-q="' + util.esc(p.Clave) + '"' + (marcada ? ' checked' : '') + '>' +
                '<span>' + util.esc(ops[i].Texto) + '</span></label></div>';
        }
        return html + '</div>';
    };

    Renderer.prototype.htmlDesplegable = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var ops = this.ordenes[p.Clave] || [];
        var html = '<select class="form-select" data-cd-q="' + util.esc(p.Clave) + '" data-cd-select="1">' +
            '<option value="">Selecciona una opción</option>';
        for (var i = 0; i < ops.length; i++) {
            html += '<option value="' + util.esc(ops[i].Clave) + '"' + (r.opcion === ops[i].Clave ? ' selected' : '') + '>' +
                util.esc(ops[i].Texto) + '</option>';
        }
        return html + '</select>';
    };

    Renderer.prototype.htmlTexto = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var max = p.MaxCaracteres ? ' maxlength="' + p.MaxCaracteres + '"' : '';
        var valor = util.esc(r.texto || '');
        var control = p.TextoLargo
            ? '<textarea class="form-control" rows="3"' + max + ' data-cd-q="' + util.esc(p.Clave) + '" data-cd-texto="1" placeholder="Escribe tu respuesta">' + valor + '</textarea>'
            : '<input type="text" class="form-control"' + max + ' data-cd-q="' + util.esc(p.Clave) + '" data-cd-texto="1" placeholder="Escribe tu respuesta" value="' + valor + '">';
        return control + '<div class="cd-contador-car" data-cd-contador="' + util.esc(p.Clave) + '">' + this.textoContador(p, (r.texto || '').length) + '</div>';
    };

    Renderer.prototype.textoContador = function (p, largo) {
        var t = largo + (p.MaxCaracteres ? ' / ' + p.MaxCaracteres : '') + ' caracteres';
        if (p.MinCaracteres) { t += ' (mínimo ' + p.MinCaracteres + ')'; }
        return t;
    };

    Renderer.prototype.htmlEscala = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var min = p.EscalaMinimo === null || p.EscalaMinimo === undefined ? 1 : p.EscalaMinimo;
        var max = p.EscalaMaximo === null || p.EscalaMaximo === undefined ? 5 : p.EscalaMaximo;
        var html = '<div class="cd-escala">';
        for (var v = min; v <= max; v++) {
            html += '<button type="button" class="cd-escala-btn' + (r.numero === v ? ' marcada' : '') + '" data-cd-q="' +
                util.esc(p.Clave) + '" data-cd-escala="' + v + '">' + v + '</button>';
        }
        html += '</div>';
        if (p.EtiquetaMinimo || p.EtiquetaMaximo) {
            html += '<div class="cd-escala-etiquetas" style="max-width:' + ((max - min + 1) * 46) + 'px"><span>' + util.esc(p.EtiquetaMinimo) +
                '</span><span>' + util.esc(p.EtiquetaMaximo) + '</span></div>';
        }
        return html;
    };

    Renderer.prototype.htmlFecha = function (p) {
        var r = this.respuestas[p.Clave] || {};
        return '<input type="date" class="form-control" style="max-width:260px" placeholder="aaaa-mm-dd" data-cd-q="' + util.esc(p.Clave) +
            '" data-cd-fecha="1"' + (p.FechaMinima ? ' min="' + p.FechaMinima + '"' : '') + (p.FechaMaxima ? ' max="' + p.FechaMaxima + '"' : '') +
            ' value="' + util.esc(r.fecha || '') + '">';
    };

    Renderer.prototype.htmlNumero = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var rango = '';
        if (p.ValorMinimo !== null && p.ValorMinimo !== undefined && p.ValorMaximo !== null && p.ValorMaximo !== undefined) {
            rango = 'Valor entre ' + p.ValorMinimo + ' y ' + p.ValorMaximo;
        } else if (p.ValorMinimo !== null && p.ValorMinimo !== undefined) {
            rango = 'Valor mínimo ' + p.ValorMinimo;
        } else if (p.ValorMaximo !== null && p.ValorMaximo !== undefined) {
            rango = 'Valor máximo ' + p.ValorMaximo;
        }
        return '<input type="number" class="form-control" style="max-width:220px" step="' + (p.PermitirDecimales ? 'any' : '1') + '"' +
            (p.ValorMinimo !== null && p.ValorMinimo !== undefined ? ' min="' + p.ValorMinimo + '"' : '') +
            (p.ValorMaximo !== null && p.ValorMaximo !== undefined ? ' max="' + p.ValorMaximo + '"' : '') +
            ' data-cd-q="' + util.esc(p.Clave) + '" data-cd-numero="1" value="' + util.esc(r.crudo !== undefined ? r.crudo : '') + '">' +
            (rango ? '<div class="small text-cd-muted mt-1">' + rango + '</div>' : '');
    };

    Renderer.prototype.htmlMatriz = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var filasResp = r.filas || {};
        var filas = p.Filas || [];
        var cols = p.Columnas || [];
        var i, j, nombre, marcada;
        if (filas.length === 0 || cols.length === 0) {
            return '<div class="text-cd-muted small">Configura filas y columnas.</div>';
        }

        // En vista móvil: un bloque por fila
        if (this.op.dispositivo === 'movil') {
            var h = '<div class="cd-matriz-movil">';
            for (i = 0; i < filas.length; i++) {
                nombre = this.nombreGrupo(p) + '_' + filas[i].Clave;
                h += '<div class="cd-matriz-bloque"><strong>' + util.esc(filas[i].Texto) + '</strong>';
                for (j = 0; j < cols.length; j++) {
                    marcada = filasResp[filas[i].Clave] === cols[j].Clave;
                    h += '<label class="cd-opcion-resp' + (marcada ? ' marcada' : '') + '"><input class="form-check-input" type="radio" name="' + nombre +
                        '" value="' + util.esc(cols[j].Clave) + '" data-cd-q="' + util.esc(p.Clave) + '" data-cd-fila="' + util.esc(filas[i].Clave) + '"' +
                        (marcada ? ' checked' : '') + '><span>' + util.esc(cols[j].Texto) + '</span></label>';
                }
                h += '</div>';
            }
            return h + '</div>';
        }

        var html = '<div class="cd-matriz-scroll"><table class="cd-matriz"><thead><tr><th></th>';
        for (j = 0; j < cols.length; j++) { html += '<th>' + util.esc(cols[j].Texto) + '</th>'; }
        html += '</tr></thead><tbody>';
        for (i = 0; i < filas.length; i++) {
            nombre = this.nombreGrupo(p) + '_' + filas[i].Clave;
            html += '<tr><td class="cd-matriz-fila">' + util.esc(filas[i].Texto) + '</td>';
            for (j = 0; j < cols.length; j++) {
                marcada = filasResp[filas[i].Clave] === cols[j].Clave;
                html += '<td><input class="form-check-input" type="radio" name="' + nombre + '" value="' + util.esc(cols[j].Clave) +
                    '" title="' + util.esc(cols[j].Texto) + '" data-cd-q="' + util.esc(p.Clave) + '" data-cd-fila="' + util.esc(filas[i].Clave) + '"' +
                    (marcada ? ' checked' : '') + '></td>';
            }
            html += '</tr>';
        }
        return html + '</tbody></table></div>';
    };

    /**
     * Multiselección dependiente: un bloque por nivel. Las opciones de cada
     * nivel son las hijas de lo seleccionado en el nivel anterior.
     */
    Renderer.prototype.htmlDependiente = function (p) {
        var r = this.respuestas[p.Clave] || {};
        var sel = r.niveles || {};
        var niveles = (p.Niveles || []).slice(0).sort(function (a, b) { return a.Nivel - b.Nivel; });
        var todas = p.OpcionesDependientes || [];
        var html = '';
        var nivelAnterior = null;

        for (var n = 0; n < niveles.length; n++) {
            var nivel = niveles[n];
            var seleccion = sel[nivel.Nivel] || [];
            html += '<div class="cd-dep-nivel"><label class="cd-label">' + util.esc(nivel.Nombre || ('Nivel ' + nivel.Nivel)) +
                (nivel.PermitirMultiple ? ' <span class="opcional">(puedes elegir varias)</span>' : '') + '</label>';

            // Grupos de opciones disponibles: [{padre, opciones[]}]
            var grupos = [];
            var i, j;
            if (n === 0) {
                var raiz = [];
                for (i = 0; i < todas.length; i++) { if (todas[i].Nivel === nivel.Nivel) { raiz.push(todas[i]); } }
                grupos.push({ padre: null, opciones: raiz });
            } else {
                var padres = sel[nivelAnterior.Nivel] || [];
                for (i = 0; i < padres.length; i++) {
                    var padre = util.buscar(todas, 'Clave', padres[i]);
                    var hijas = [];
                    for (j = 0; j < todas.length; j++) { if (todas[j].ClavePadre === padres[i]) { hijas.push(todas[j]); } }
                    if (hijas.length > 0) { grupos.push({ padre: padre, opciones: hijas }); }
                }
            }

            var total = 0;
            for (i = 0; i < grupos.length; i++) { total += grupos[i].opciones.length; }

            if (total === 0) {
                html += '<div class="small text-cd-muted">' + (n === 0 ? 'Sin opciones configuradas.' :
                    'Selecciona primero ' + util.esc((nivelAnterior.Nombre || '').toLowerCase()) + '.') + '</div>';
            } else if (!nivel.PermitirMultiple) {
                html += '<select class="form-select" style="max-width:420px" data-cd-q="' + util.esc(p.Clave) + '" data-cd-dep="' + nivel.Nivel + '">' +
                    '<option value="">Selecciona...</option>';
                for (i = 0; i < grupos.length; i++) {
                    if (grupos.length > 1 && grupos[i].padre) { html += '<optgroup label="' + util.esc(grupos[i].padre.Texto) + '">'; }
                    for (j = 0; j < grupos[i].opciones.length; j++) {
                        var o = grupos[i].opciones[j];
                        html += '<option value="' + util.esc(o.Clave) + '"' + (util.contiene(seleccion, o.Clave) ? ' selected' : '') + '>' + util.esc(o.Texto) + '</option>';
                    }
                    if (grupos.length > 1 && grupos[i].padre) { html += '</optgroup>'; }
                }
                html += '</select>';
            } else {
                for (i = 0; i < grupos.length; i++) {
                    if (grupos.length > 1 && grupos[i].padre) { html += '<div class="cd-dep-grupo">' + util.esc(grupos[i].padre.Texto) + '</div>'; }
                    for (j = 0; j < grupos[i].opciones.length; j++) {
                        var oc = grupos[i].opciones[j];
                        var marcada = util.contiene(seleccion, oc.Clave);
                        html += '<label class="cd-chip-opcion' + (marcada ? ' marcada' : '') + '"><input type="checkbox" value="' + util.esc(oc.Clave) +
                            '" data-cd-q="' + util.esc(p.Clave) + '" data-cd-dep="' + nivel.Nivel + '"' + (marcada ? ' checked' : '') + '>' +
                            (marcada ? '<i class="bi bi-check2 me-1"></i>' : '') + util.esc(oc.Texto) + '</label>';
                    }
                }
            }
            html += '</div>';
            nivelAnterior = nivel;
        }
        if (niveles.length === 0) { html = '<div class="text-cd-muted small">Configura los niveles.</div>'; }
        return html;
    };

    // ==================================================================
    //  EVENTOS (delegados en el contenedor)
    // ==================================================================
    Renderer.prototype.enlazarEventos = function () {
        var self = this;
        var $c = this.$c;
        $c.off('.cdr');

        // Radios: opción única, sí/no, matriz
        $c.on('change.cdr', 'input[type=radio][data-cd-q]', function () {
            var clave = jQuery(this).attr('data-cd-q');
            var r = self.resp(clave);
            var fila = jQuery(this).attr('data-cd-fila');
            if (fila) {
                r.filas = r.filas || {};
                r.filas[fila] = this.value;
            } else {
                r.opcion = this.value;
                self.mostrarOtro(clave, this.value === OTRO);
            }
            jQuery('input[name="' + this.name + '"]', $c).each(function () {
                jQuery(this).closest('.cd-opcion-resp').toggleClass('marcada', this.checked);
            });
            self.alCambiar(clave);
        });

        // Checkboxes: selección múltiple
        $c.on('change.cdr', 'input[type=checkbox][data-cd-q]:not([data-cd-dep])', function () {
            var clave = jQuery(this).attr('data-cd-q');
            var p = self.mapa[clave];
            var $grupo = jQuery('input[name="' + this.name + '"]', $c);
            var marcadas = $grupo.filter(':checked');
            if (this.checked && p.MaxSelecciones && marcadas.length > p.MaxSelecciones) {
                this.checked = false;
                self.marcarError(clave, 'Puedes elegir máximo ' + p.MaxSelecciones + ' opciones.');
                return;
            }
            var lista = [];
            $grupo.filter(':checked').each(function () { lista.push(this.value); });
            var r = self.resp(clave);
            r.opciones = lista;
            self.mostrarOtro(clave, util.contiene(lista, OTRO));
            jQuery(this).closest('.cd-opcion-resp').toggleClass('marcada', this.checked);
            self.alCambiar(clave);
        });

        // Texto de "Otro"
        $c.on('input.cdr keyup.cdr', '.cd-otro-texto', function () {
            self.resp(jQuery(this).attr('data-cd-q')).otro = this.value;
        });

        // Desplegable
        $c.on('change.cdr', 'select[data-cd-select]', function () {
            var clave = jQuery(this).attr('data-cd-q');
            self.resp(clave).opcion = this.value || null;
            self.alCambiar(clave);
        });

        // Texto libre + contador
        $c.on('input.cdr keyup.cdr change.cdr', '[data-cd-texto]', function () {
            var clave = jQuery(this).attr('data-cd-q');
            var p = self.mapa[clave];
            self.resp(clave).texto = this.value;
            var largo = this.value.length;
            jQuery('[data-cd-contador="' + clave + '"]', $c)
                .text(self.textoContador(p, largo))
                .toggleClass('excedido', (p.MaxCaracteres && largo > p.MaxCaracteres) || (p.MinCaracteres && largo > 0 && largo < p.MinCaracteres));
            self.alCambiar(clave);
        });

        // Escala
        $c.on('click.cdr', '.cd-escala-btn', function (e) {
            e.preventDefault();
            var clave = jQuery(this).attr('data-cd-q');
            var r = self.resp(clave);
            var v = parseInt(jQuery(this).attr('data-cd-escala'), 10);
            r.numero = r.numero === v ? null : v;     // segundo clic deselecciona
            jQuery(this).siblings().removeClass('marcada');
            jQuery(this).toggleClass('marcada', r.numero === v);
            self.alCambiar(clave);
        });

        // Número
        $c.on('input.cdr change.cdr', '[data-cd-numero]', function () {
            var clave = jQuery(this).attr('data-cd-q');
            var r = self.resp(clave);
            r.crudo = this.value;
            r.numero = util.numero(this.value);
            self.alCambiar(clave);
        });

        // Fecha
        $c.on('change.cdr input.cdr', '[data-cd-fecha]', function () {
            var clave = jQuery(this).attr('data-cd-q');
            self.resp(clave).fecha = this.value || null;
            self.alCambiar(clave);
        });

        // Multiselección dependiente (select o chips)
        $c.on('change.cdr', '[data-cd-dep]', function () {
            var clave = jQuery(this).attr('data-cd-q');
            var nivel = parseInt(jQuery(this).attr('data-cd-dep'), 10);
            var r = self.resp(clave);
            r.niveles = r.niveles || {};
            if (this.tagName === 'SELECT') {
                r.niveles[nivel] = this.value ? [this.value] : [];
            } else {
                var actual = r.niveles[nivel] || [];
                var nueva = [];
                for (var i = 0; i < actual.length; i++) { if (actual[i] !== this.value) { nueva.push(actual[i]); } }
                if (this.checked) { nueva.push(this.value); }
                r.niveles[nivel] = nueva;
            }
            self.podarDependiente(self.mapa[clave], r);
            jQuery('[data-cd-pregunta="' + clave + '"] .cd-form-control', $c).html(self.htmlDependiente(self.mapa[clave]));
            self.alCambiar(clave);
        });

        // Enviar
        $c.on('click.cdr', '.cd-enviar', function (e) {
            e.preventDefault();
            self.enviar();
        });
    };

    Renderer.prototype.resp = function (clave) {
        if (!this.respuestas[clave]) { this.respuestas[clave] = {}; }
        return this.respuestas[clave];
    };

    Renderer.prototype.mostrarOtro = function (clave, mostrar) {
        var $otro = jQuery('[data-cd-pregunta="' + clave + '"] .cd-otro-texto', this.$c);
        $otro.toggleClass('cd-oculto', !mostrar);
        if (mostrar) { $otro.trigger('focus'); }
    };

    /** Quita selecciones de niveles inferiores que ya no dependen de lo elegido arriba. */
    Renderer.prototype.podarDependiente = function (p, r) {
        var niveles = (p.Niveles || []).slice(0).sort(function (a, b) { return a.Nivel - b.Nivel; });
        for (var n = 1; n < niveles.length; n++) {
            var padres = r.niveles[niveles[n - 1].Nivel] || [];
            var actuales = r.niveles[niveles[n].Nivel] || [];
            var validas = [];
            for (var i = 0; i < actuales.length; i++) {
                var op = util.buscar(p.OpcionesDependientes, 'Clave', actuales[i]);
                if (op && util.contiene(padres, op.ClavePadre)) { validas.push(actuales[i]); }
            }
            r.niveles[niveles[n].Nivel] = validas;
        }
    };

    Renderer.prototype.alCambiar = function (clave) {
        // Si la pregunta tenía error y ya es válida, se limpia el mensaje
        var $q = jQuery('[data-cd-pregunta="' + clave + '"]', this.$c);
        if ($q.hasClass('con-error') && !this.errorPregunta(this.mapa[clave])) {
            $q.removeClass('con-error');
        }
        this.actualizar();
        if (this.op.alCambiar) { this.op.alCambiar(clave, this); }
    };

    // ==================================================================
    //  LÓGICA CONDICIONAL
    // ==================================================================

    /**
     * Recorre las preguntas en orden y calcula cuáles se muestran.
     * - Una pregunta destino de una regla "mostrar" inicia oculta y solo
     *   aparece si alguna regla la activa.
     * - "ocultar" la esconde cuando se cumple la condición.
     * - "irA" salta (oculta) todas las preguntas intermedias.
     * - "finalizar" oculta todo lo que sigue.
     * Las preguntas ocultas no se validan ni se envían.
     */
    Renderer.prototype.calcularVisibilidad = function () {
        var preguntas = this.encuesta.Preguntas || [];
        var destinosMostrar = {};
        var i, j, p, regla;

        for (i = 0; i < preguntas.length; i++) {
            var reglas = preguntas[i].Reglas || [];
            for (j = 0; j < reglas.length; j++) {
                if (reglas[j].Accion === 'mostrar' && reglas[j].ClaveDestino) { destinosMostrar[reglas[j].ClaveDestino] = true; }
            }
        }

        var visibles = {};
        var mostradas = {};
        var ocultas = {};
        var saltarHasta = null;
        var finalizadaPor = null;

        for (i = 0; i < preguntas.length; i++) {
            p = preguntas[i];
            if (finalizadaPor) { visibles[p.Clave] = false; continue; }
            if (saltarHasta) {
                if (p.Clave !== saltarHasta) { visibles[p.Clave] = false; continue; }
                saltarHasta = null;
            }
            var visible = true;
            if (destinosMostrar[p.Clave] && !mostradas[p.Clave]) { visible = false; }
            if (ocultas[p.Clave]) { visible = false; }
            visibles[p.Clave] = visible;
            if (!visible) { continue; }

            var rs = p.Reglas || [];
            for (j = 0; j < rs.length; j++) {
                regla = rs[j];
                if (!this.cumpleRegla(p, regla)) { continue; }
                if (regla.Accion === 'mostrar') { mostradas[regla.ClaveDestino] = true; }
                else if (regla.Accion === 'ocultar') { ocultas[regla.ClaveDestino] = true; }
                else if (regla.Accion === 'irA' && this.estaDespues(p.Clave, regla.ClaveDestino)) { saltarHasta = regla.ClaveDestino; }
                else if (regla.Accion === 'finalizar') { finalizadaPor = p.Clave; }
            }
        }
        return { visibles: visibles, finalizadaPor: finalizadaPor };
    };

    Renderer.prototype.estaDespues = function (claveOrigen, claveDestino) {
        var preguntas = this.encuesta.Preguntas || [];
        var io = util.indice(preguntas, 'Clave', claveOrigen);
        var id = util.indice(preguntas, 'Clave', claveDestino);
        return id > io && io >= 0;
    };

    /** Evalúa SI (respuesta Operador Valor). */
    Renderer.prototype.cumpleRegla = function (p, regla) {
        var r = this.respuestas[p.Clave];
        if (!r || !this.respondida(p, r)) { return false; }
        var op = regla.Operador || 'igual';
        var valor = regla.Valor;
        var lista, n, v, t;

        switch (p.Tipo) {
            case 'unica':
            case 'desplegable':
            case 'sino':
                if (op === 'distinto') { return r.opcion !== valor; }
                return r.opcion === valor;

            case 'multiple':
                lista = r.opciones || [];
                if (op === 'distinto') { return !util.contiene(lista, valor); }
                return util.contiene(lista, valor);

            case 'dependiente':
                lista = this.seleccionDependiente(r);
                if (op === 'distinto') { return !util.contiene(lista, valor); }
                return util.contiene(lista, valor);

            case 'escala':
            case 'numero':
                n = r.numero;
                v = util.numero(valor);
                if (v === null) { return false; }
                if (op === 'mayor') { return n > v; }
                if (op === 'menor') { return n < v; }
                if (op === 'distinto') { return n !== v; }
                return n === v;

            case 'fecha':
                if (op === 'mayor') { return r.fecha > valor; }
                if (op === 'menor') { return r.fecha < valor; }
                if (op === 'distinto') { return r.fecha !== valor; }
                return r.fecha === valor;

            case 'texto':
                t = String(r.texto || '').toLowerCase();
                v = String(valor || '').toLowerCase();
                if (op === 'contiene') { return t.indexOf(v) >= 0; }
                if (op === 'distinto') { return t !== v; }
                return t === v;

            case 'matriz':
                var filas = r.filas || {};
                var encontrado = false;
                for (var k in filas) { if (filas.hasOwnProperty(k) && filas[k] === valor) { encontrado = true; } }
                return op === 'distinto' ? !encontrado : encontrado;
        }
        return false;
    };

    Renderer.prototype.seleccionDependiente = function (r) {
        var lista = [];
        var niveles = r.niveles || {};
        for (var k in niveles) {
            if (niveles.hasOwnProperty(k)) { lista = lista.concat(niveles[k] || []); }
        }
        return lista;
    };

    /** Aplica visibilidad y actualiza el progreso. */
    Renderer.prototype.actualizar = function () {
        if (this.op.soloPreguntas) { return; }
        var res = this.calcularVisibilidad();
        var preguntas = this.encuesta.Preguntas || [];
        var total = 0;
        var respondidas = 0;
        for (var i = 0; i < preguntas.length; i++) {
            var p = preguntas[i];
            var vis = res.visibles[p.Clave] !== false;
            jQuery('[data-cd-pregunta="' + p.Clave + '"]', this.$c).toggleClass('cd-oculto', !vis);
            if (vis) {
                total++;
                if (this.respondida(p, this.respuestas[p.Clave])) { respondidas++; }
            }
        }
        jQuery('.cd-finaliza-aviso', this.$c).toggleClass('cd-oculto', !res.finalizadaPor);
        var pct = total > 0 ? Math.round(respondidas * 100 / total) : 0;
        jQuery('.cd-progreso-barra', this.$c).css('width', pct + '%');
        jQuery('.cd-progreso-texto', this.$c).text(respondidas + ' de ' + total + ' preguntas respondidas');
        this.visibilidad = res;
    };

    // ==================================================================
    //  VALIDACIÓN
    // ==================================================================
    Renderer.prototype.respondida = function (p, r) {
        if (!r) { return false; }
        switch (p.Tipo) {
            case 'unica':
            case 'desplegable':
            case 'sino':
                return !!r.opcion;
            case 'multiple':
                return !!(r.opciones && r.opciones.length);
            case 'texto':
                return !util.vacio(r.texto);
            case 'escala':
                return r.numero !== null && r.numero !== undefined;
            case 'numero':
                return !util.vacio(r.crudo);
            case 'fecha':
                return !!r.fecha;
            case 'matriz':
                for (var k in (r.filas || {})) { if (r.filas.hasOwnProperty(k)) { return true; } }
                return false;
            case 'dependiente':
                return this.seleccionDependiente(r).length > 0;
        }
        return false;
    };

    /** Regresa el mensaje de error de la pregunta o null si es válida. */
    Renderer.prototype.errorPregunta = function (p) {
        var r = this.respuestas[p.Clave];
        var respondida = this.respondida(p, r);
        if (!respondida) {
            return p.Obligatoria ? 'Esta pregunta es obligatoria.' : null;
        }
        var i;
        switch (p.Tipo) {
            case 'unica':
                if (r.opcion === OTRO && util.vacio(r.otro)) { return 'Especifica tu respuesta en «Otro».'; }
                break;
            case 'multiple':
                var n = r.opciones.length;
                if (p.MinSelecciones && n < p.MinSelecciones) { return 'Elige al menos ' + p.MinSelecciones + ' opciones.'; }
                if (p.MaxSelecciones && n > p.MaxSelecciones) { return 'Puedes elegir máximo ' + p.MaxSelecciones + ' opciones.'; }
                if (util.contiene(r.opciones, OTRO) && util.vacio(r.otro)) { return 'Especifica tu respuesta en «Otro».'; }
                break;
            case 'texto':
                var largo = String(r.texto).length;
                if (p.MinCaracteres && largo < p.MinCaracteres) { return 'Escribe al menos ' + p.MinCaracteres + ' caracteres (llevas ' + largo + ').'; }
                if (p.MaxCaracteres && largo > p.MaxCaracteres) { return 'Máximo ' + p.MaxCaracteres + ' caracteres.'; }
                break;
            case 'numero':
                if (r.numero === null) { return 'Ingresa un número válido.'; }
                if (!p.PermitirDecimales && Math.floor(r.numero) !== r.numero) { return 'Solo se permiten números enteros.'; }
                if (p.ValorMinimo !== null && p.ValorMinimo !== undefined && r.numero < p.ValorMinimo) { return 'El valor mínimo es ' + p.ValorMinimo + '.'; }
                if (p.ValorMaximo !== null && p.ValorMaximo !== undefined && r.numero > p.ValorMaximo) { return 'El valor máximo es ' + p.ValorMaximo + '.'; }
                break;
            case 'fecha':
                if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) { return 'Ingresa la fecha con formato aaaa-mm-dd.'; }
                if (p.FechaMinima && r.fecha < p.FechaMinima) { return 'La fecha debe ser a partir del ' + util.fecha(p.FechaMinima) + '.'; }
                if (p.FechaMaxima && r.fecha > p.FechaMaxima) { return 'La fecha debe ser hasta el ' + util.fecha(p.FechaMaxima) + '.'; }
                break;
            case 'matriz':
                var faltan = 0;
                for (i = 0; i < (p.Filas || []).length; i++) { if (!r.filas[p.Filas[i].Clave]) { faltan++; } }
                if (faltan > 0 && p.Obligatoria) { return 'Responde todas las filas (faltan ' + faltan + ').'; }
                break;
            case 'dependiente':
                if (p.Obligatoria) {
                    var niveles = (p.Niveles || []).slice(0).sort(function (a, b) { return a.Nivel - b.Nivel; });
                    for (i = 0; i < niveles.length; i++) {
                        var sel = (r.niveles || {})[niveles[i].Nivel] || [];
                        if (sel.length === 0 && this.nivelTieneOpciones(p, r, i, niveles)) {
                            return 'Selecciona ' + String(niveles[i].Nombre || 'una opción').toLowerCase() + '.';
                        }
                    }
                }
                break;
        }
        return null;
    };

    Renderer.prototype.nivelTieneOpciones = function (p, r, indice, niveles) {
        if (indice === 0) { return true; }
        var padres = (r.niveles || {})[niveles[indice - 1].Nivel] || [];
        for (var i = 0; i < (p.OpcionesDependientes || []).length; i++) {
            if (util.contiene(padres, p.OpcionesDependientes[i].ClavePadre)) { return true; }
        }
        return false;
    };

    Renderer.prototype.marcarError = function (clave, mensaje) {
        var $q = jQuery('[data-cd-pregunta="' + clave + '"]', this.$c);
        $q.addClass('con-error').find('.cd-form-error').html('<i class="bi bi-exclamation-circle me-1"></i>' + util.esc(mensaje));
    };

    /** Valida las preguntas visibles. Regresa true si todo está correcto. */
    Renderer.prototype.validar = function () {
        this.actualizar();
        var preguntas = this.encuesta.Preguntas || [];
        var primera = null;
        for (var i = 0; i < preguntas.length; i++) {
            var p = preguntas[i];
            var $q = jQuery('[data-cd-pregunta="' + p.Clave + '"]', this.$c);
            if (this.visibilidad.visibles[p.Clave] === false) { $q.removeClass('con-error'); continue; }
            var error = this.errorPregunta(p);
            if (error) {
                this.marcarError(p.Clave, error);
                if (!primera) { primera = $q; }
            } else {
                $q.removeClass('con-error');
            }
        }
        if (primera) {
            var $scroll = jQuery('html, body');
            $scroll.animate({ scrollTop: Math.max(0, primera.offset().top - 90) }, 250);
            return false;
        }
        return true;
    };

    // ==================================================================
    //  ARMADO DEL PAQUETE DE RESPUESTAS (modelo dinámico)
    // ==================================================================
    Renderer.prototype.construirRespuestas = function () {
        var lista = [];
        var preguntas = this.encuesta.Preguntas || [];
        var vis = this.calcularVisibilidad().visibles;

        function fila(clave, opcion, filaClave, texto, numero, fecha) {
            lista.push({ ClavePregunta: clave, ClaveOpcion: opcion || null, ClaveFila: filaClave || null,
                ValorTexto: texto || null, ValorNumero: numero === undefined ? null : numero, ValorFecha: fecha || null });
        }

        for (var i = 0; i < preguntas.length; i++) {
            var p = preguntas[i];
            var r = this.respuestas[p.Clave];
            if (vis[p.Clave] === false || !this.respondida(p, r)) { continue; }
            var j, k;
            switch (p.Tipo) {
                case 'unica':
                case 'desplegable':
                case 'sino':
                    fila(p.Clave, r.opcion, null, r.opcion === OTRO ? r.otro : null);
                    break;
                case 'multiple':
                    for (j = 0; j < r.opciones.length; j++) {
                        fila(p.Clave, r.opciones[j], null, r.opciones[j] === OTRO ? r.otro : null);
                    }
                    break;
                case 'texto':
                    fila(p.Clave, null, null, r.texto);
                    break;
                case 'escala':
                case 'numero':
                    fila(p.Clave, null, null, null, r.numero);
                    break;
                case 'fecha':
                    fila(p.Clave, null, null, null, null, r.fecha);
                    break;
                case 'matriz':
                    for (k in r.filas) { if (r.filas.hasOwnProperty(k)) { fila(p.Clave, r.filas[k], k); } }
                    break;
                case 'dependiente':
                    var sel = this.seleccionDependiente(r);
                    for (j = 0; j < sel.length; j++) { fila(p.Clave, sel[j]); }
                    break;
            }
        }
        return lista;
    };

    Renderer.prototype.enviar = function () {
        if (this.enviado) { return; }
        if (!this.validar()) {
            CD.ui.toast('Revisa las preguntas marcadas en rojo.', 'error');
            return;
        }
        var respuestas = this.construirRespuestas();
        if (this.op.alEnviar) {
            this.op.alEnviar(respuestas, this);
        } else {
            this.mostrarFinal((this.encuesta.Publicacion || {}).MensajeFinal);
        }
    };

    Renderer.prototype.setEnviando = function (enviando) {
        jQuery('.cd-enviar', this.$c).prop('disabled', enviando)
            .html(enviando ? '<span class="spinner-border spinner-border-sm me-1"></span>Enviando...' : '<i class="bi bi-send me-1"></i>Enviar respuestas');
    };

    Renderer.prototype.mostrarFinal = function (mensaje) {
        this.enviado = true;
        var extra = this.op.modo === 'preview'
            ? '<div class="small text-cd-muted mt-2">(Vista previa: no se guardó ninguna respuesta)</div>' +
              '<button type="button" class="btn btn-cd-borde btn-sm mt-3 cd-reiniciar-preview"><i class="bi bi-arrow-counterclockwise me-1"></i>Volver a probar</button>'
            : '';
        this.$c.html('<div class="cd-form-final"><i class="bi bi-check-circle"></i><h4 class="mt-2">' +
            util.esc(mensaje || '¡Gracias por tu respuesta!') + '</h4>' + extra + '</div>');
        var self = this;
        this.$c.off('click.cdrf').on('click.cdrf', '.cd-reiniciar-preview', function () { self.reiniciar(); });
        jQuery('html, body').animate({ scrollTop: Math.max(0, this.$c.offset().top - 90) }, 200);
    };

    Renderer.prototype.reiniciar = function () {
        this.respuestas = {};
        this.enviado = false;
        this.render();
    };

    CD.Renderer = Renderer;

})(window.CD);

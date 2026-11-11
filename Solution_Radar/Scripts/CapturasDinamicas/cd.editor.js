/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Constructor de encuestas (cd.editor.js)

   Controla la vista Editor.cshtml y sus parciales:
     _EditorEncabezado     -> nombre, estatus, versión, botones
     _EditorConstructor    -> lista de preguntas, panel de edición, tipos, lógica
     _EditorConfiguracion  -> publicación y segmentación
     _EditorVistaPrevia    -> vista previa Desktop / Tablet / Móvil
     _EditorResultados     -> resultados (cd.resultados.js)
     _EditorModales        -> modales y offcanvas

   Toda la encuesta vive en memoria en S.encuesta (mismo formato que el
   modelo C# EncuestaEditor). Los cambios se envían al servidor solo al
   "Guardar borrador" o "Publicar encuesta".
   ===================================================================== */

(function (CD) {
    'use strict';

    var util = CD.util;
    var ui = CD.ui;
    var $ = jQuery;

    // ------------------------------------------------------------------
    //  ESTADO
    // ------------------------------------------------------------------
    var S = {
        id: 0,                 // IdEncuesta
        encuesta: null,        // documento completo en edición
        sel: null,             // clave de la pregunta seleccionada
        sucio: false,          // hay cambios sin guardar
        tab: 'constructor',
        dispositivo: 'desktop',
        ocupado: false,
        dragClave: null,
        depActivo: {},         // por pregunta dependiente: claves activas por nivel (editor de árbol)
        abiertos: { validaciones: true, logica: false }
    };

    // ==================================================================
    //  INICIO Y CARGA
    // ==================================================================
    function init(cfg) {
        S.id = cfg.idEncuesta;
        // Permite abrir directo una pestaña: Editor/5#resultados
        S.tabInicial = (window.location.hash || '').replace('#', '');
        enlazarEventos();
        renderTipos();
        cargar(null);

        // Aviso al salir con cambios sin guardar
        window.onbeforeunload = function () {
            if (S.sucio) { return 'Tienes cambios sin guardar.'; }
        };
    }

    function cargar(idVersion, mantenerSeleccion) {
        ui.cargando($('#cdListaPreguntas'), 'Cargando encuesta...');
        CD.api.obtenerEncuesta(S.id, idVersion)
            .done(function (e) { asignarEncuesta(e, mantenerSeleccion); })
            .fail(function (msg) {
                ui.toast(msg, 'error');
                $('#cdListaPreguntas').html('<li class="cd-vacio"><i class="bi bi-exclamation-triangle"></i>' + util.esc(msg) + '</li>');
            });
    }

    function asignarEncuesta(e, mantenerSeleccion) {
        var anterior = S.sel;
        e.Preguntas = e.Preguntas || [];
        for (var i = 0; i < e.Preguntas.length; i++) { normalizarPregunta(e.Preguntas[i]); }
        e.Publicacion = e.Publicacion || {};
        e.Segmentacion = e.Segmentacion || [];
        S.encuesta = e;
        S.sucio = false;
        S.sel = (mantenerSeleccion && util.buscar(e.Preguntas, 'Clave', anterior)) ? anterior
            : (e.Preguntas.length ? e.Preguntas[0].Clave : null);
        renderTodo();
        if (S.tabInicial) {
            if ($('#cdTab-' + S.tabInicial).length) { mostrarTab(S.tabInicial); }
            S.tabInicial = null;
        }
    }

    function renderTodo() {
        renderEncabezado();
        renderLista();
        renderPanel();
        renderPreviewPregunta();
        renderLogica();
        renderConfiguracion();
        if (S.tab === 'preview') { renderPreview(); }
        if (S.tab === 'resultados') { CD.Resultados.cargar(S.id, null); }
    }

    // ==================================================================
    //  MODELO: preguntas
    // ==================================================================
    function preguntas() { return S.encuesta.Preguntas; }
    function actual() { return S.sel ? util.buscar(preguntas(), 'Clave', S.sel) : null; }
    function indiceDe(clave) { return util.indice(preguntas(), 'Clave', clave); }

    function normalizarPregunta(p) {
        var listas = ['Opciones', 'Filas', 'Columnas', 'Niveles', 'OpcionesDependientes', 'Reglas'];
        for (var i = 0; i < listas.length; i++) { p[listas[i]] = p[listas[i]] || []; }
        return p;
    }

    function opcionesTexto(prefijo, textos) {
        var lista = [];
        for (var i = 0; i < textos.length; i++) { lista.push({ Clave: util.clave(prefijo), Texto: textos[i] }); }
        return lista;
    }

    /** Pregunta nueva con valores por defecto según el tipo. */
    function nuevaPregunta(tipo) {
        var p = normalizarPregunta({
            Clave: util.clave('q'), Orden: 0, Tipo: tipo, Texto: '', Descripcion: '',
            Obligatoria: false, OrdenAleatorio: false, PermitirOtro: false, TextoLargo: false,
            MinCaracteres: null, MaxCaracteres: null, MinSelecciones: null, MaxSelecciones: null,
            ValorMinimo: null, ValorMaximo: null, PermitirDecimales: false,
            EscalaMinimo: null, EscalaMaximo: null, EtiquetaMinimo: '', EtiquetaMaximo: '',
            FechaMinima: null, FechaMaxima: null,
            PermitirCalendario: false, CalendarioPedirHora: true, CalendarioTitulo: '', CalendarioDuracion: 60,
            EsLlave: false
        });
        aplicarDefaultsTipo(p, null);
        return p;
    }

    /** Ajusta la pregunta al cambiar de tipo (conserva lo que sea compatible). */
    function aplicarDefaultsTipo(p, tipoAnterior) {
        var def = CD.tipo(p.Tipo);
        var anteriorUsabaOpciones = tipoAnterior && CD.tipo(tipoAnterior).usaOpciones && tipoAnterior !== 'sino';

        if (p.Tipo === 'sino') {
            p.Opciones = opcionesTexto('o', ['Sí', 'No']);
        } else if (def.usaOpciones && (!anteriorUsabaOpciones || p.Opciones.length === 0)) {
            p.Opciones = opcionesTexto('o', ['Opción 1', 'Opción 2', 'Opción 3']);
        }
        if (!def.permiteOtro) { p.PermitirOtro = false; }
        if (!def.usaOpciones || def.opcionesFijas) { p.OrdenAleatorio = false; }
        if (!puedeSerLlave(p.Tipo)) { p.EsLlave = false; }
        if (p.Tipo !== 'fecha') { p.PermitirCalendario = false; }
        if (p.Tipo === 'texto' && p.EsLlave) { p.TextoLargo = false; }

        if (p.Tipo === 'matriz') {
            if (p.Filas.length === 0) { p.Filas = opcionesTexto('f', ['Aspecto 1', 'Aspecto 2', 'Aspecto 3']); }
            if (p.Columnas.length === 0) {
                p.Columnas = opcionesTexto('c', ['Muy insatisfecho', 'Insatisfecho', 'Neutral', 'Satisfecho', 'Muy satisfecho']);
            }
        }
        if (p.Tipo === 'escala' && p.EscalaMinimo === null) {
            p.EscalaMinimo = 1; p.EscalaMaximo = 5;
        }
        if (p.Tipo === 'dependiente' && p.Niveles.length === 0) {
            p.Niveles = [{ Nivel: 1, Nombre: 'Categoría', PermitirMultiple: false },
                         { Nivel: 2, Nombre: 'Subcategoría', PermitirMultiple: true }];
            var a = util.clave('d');
            var b = util.clave('d');
            p.OpcionesDependientes = [
                { Clave: a, Nivel: 1, ClavePadre: null, Texto: 'Categoría A' },
                { Clave: b, Nivel: 1, ClavePadre: null, Texto: 'Categoría B' },
                { Clave: util.clave('d'), Nivel: 2, ClavePadre: a, Texto: 'Opción A1' },
                { Clave: util.clave('d'), Nivel: 2, ClavePadre: a, Texto: 'Opción A2' },
                { Clave: util.clave('d'), Nivel: 2, ClavePadre: b, Texto: 'Opción B1' }
            ];
        }
    }

    /** Solo texto y número pueden ser campo llave. */
    function puedeSerLlave(tipo) {
        return tipo === 'texto' || tipo === 'numero';
    }

    function preguntaLlave() {
        var lista = preguntas();
        for (var i = 0; i < lista.length; i++) { if (lista[i].EsLlave) { return lista[i]; } }
        return null;
    }

    /** Marca/desmarca el campo llave (solo uno por encuesta; queda obligatoria). */
    function asignarLlave(p, activar) {
        if (activar) {
            var anterior = preguntaLlave();
            if (anterior && anterior !== p) {
                anterior.EsLlave = false;
                ui.toast('P' + (indiceDe(anterior.Clave) + 1) + ' dejó de ser el campo llave; ahora es P' + (indiceDe(p.Clave) + 1) + '.', 'info');
            }
            p.EsLlave = true;
            p.Obligatoria = true;
            p.TextoLargo = false;
        } else {
            p.EsLlave = false;
        }
        renderNotaLlave();
    }

    function agregarPregunta(tipo) {
        var p = nuevaPregunta(tipo);
        var idx = S.sel ? indiceDe(S.sel) + 1 : preguntas().length;
        preguntas().splice(idx, 0, p);
        S.sel = p.Clave;
        S.abiertos.logica = false;
        marcarSucio();
        renderLista();
        renderPanel();
        renderPreviewPregunta();
        renderLogica();
        ui.modal('cdModalTipos', 'hide');
        mostrarTab('constructor');
        setTimeout(function () { $('#cdPanelPregunta [data-campo="Texto"]').trigger('focus'); }, 50);
    }

    /** Copia profunda con claves nuevas (preguntas, opciones y reglas). */
    function duplicarPregunta(clave) {
        var original = util.buscar(preguntas(), 'Clave', clave);
        if (!original) { return; }
        var p = util.clonar(original);
        var mapa = {};
        var i;
        p.Clave = util.clave('q');
        p.Texto = (p.Texto || '') + ' (copia)';
        p.EsLlave = false;      // solo puede haber un campo llave
        var listas = ['Opciones', 'Filas', 'Columnas', 'OpcionesDependientes'];
        for (var l = 0; l < listas.length; l++) {
            for (i = 0; i < p[listas[l]].length; i++) {
                var nueva = util.clave('o');
                mapa[p[listas[l]][i].Clave] = nueva;
                p[listas[l]][i].Clave = nueva;
            }
        }
        for (i = 0; i < p.OpcionesDependientes.length; i++) {
            var od = p.OpcionesDependientes[i];
            if (od.ClavePadre && mapa[od.ClavePadre]) { od.ClavePadre = mapa[od.ClavePadre]; }
        }
        for (i = 0; i < p.Reglas.length; i++) {
            p.Reglas[i].Clave = util.clave('r');
            if (mapa[p.Reglas[i].Valor]) { p.Reglas[i].Valor = mapa[p.Reglas[i].Valor]; }
        }
        preguntas().splice(indiceDe(clave) + 1, 0, p);
        S.sel = p.Clave;
        marcarSucio();
        refrescarTodoConstructor();
        ui.toast('Pregunta duplicada.', 'exito');
    }

    function eliminarPregunta(clave) {
        var idx = indiceDe(clave);
        if (idx < 0) { return; }
        var referencias = 0;
        var lista = preguntas();
        for (var i = 0; i < lista.length; i++) {
            for (var j = 0; j < lista[i].Reglas.length; j++) {
                if (lista[i].Reglas[j].ClaveDestino === clave) { referencias++; }
            }
        }
        ui.confirmar({
            titulo: 'Eliminar pregunta',
            mensajeHtml: '¿Eliminar la pregunta <strong>P' + (idx + 1) + '</strong>?' +
                (referencias ? '<br><span class="text-cd-red">También se eliminarán ' + referencias + ' regla(s) que apuntan a ella.</span>' : ''),
            textoBoton: 'Eliminar',
            alAceptar: function () {
                lista.splice(idx, 1);
                for (var a = 0; a < lista.length; a++) {
                    var nuevas = [];
                    for (var b = 0; b < lista[a].Reglas.length; b++) {
                        if (lista[a].Reglas[b].ClaveDestino !== clave) { nuevas.push(lista[a].Reglas[b]); }
                    }
                    lista[a].Reglas = nuevas;
                }
                S.sel = lista.length ? lista[Math.min(idx, lista.length - 1)].Clave : null;
                marcarSucio();
                refrescarTodoConstructor();
            }
        });
    }

    function moverPregunta(clave, nuevoIndice) {
        var lista = preguntas();
        var idx = indiceDe(clave);
        if (idx < 0 || nuevoIndice < 0 || nuevoIndice >= lista.length || nuevoIndice === idx) { return; }
        var p = lista.splice(idx, 1)[0];
        lista.splice(nuevoIndice, 0, p);
        marcarSucio();
        refrescarTodoConstructor();
    }

    function refrescarTodoConstructor() {
        renderLista();
        renderPanel();
        renderPreviewPregunta();
        renderLogica();
        renderNotaLlave();
    }

    /** Nota en Configuración cuando la encuesta tiene campo llave. */
    function renderNotaLlave() {
        var llave = preguntaLlave();
        var $nota = $('#cdCfgNotaLlave');
        if (!llave) { $nota.addClass('cd-oculto').html(''); return; }
        $nota.removeClass('cd-oculto').html('<i class="bi bi-key me-1"></i>Esta encuesta tiene campo llave: <strong>P' + (indiceDe(llave.Clave) + 1) +
            ' · ' + util.esc(llave.Texto || '(sin texto)') + '</strong>. Se permiten varias capturas (una nueva cada vez que se envía) ' +
            'y en Resultados se cuenta solo la última captura de cada valor. La opción «Una respuesta» no aplica.');
    }

    function marcarSucio() {
        S.sucio = true;
        $('#cdBadgeSucio').removeClass('cd-oculto');
    }

    // ==================================================================
    //  ENCABEZADO
    // ==================================================================
    function renderEncabezado() {
        var e = S.encuesta;
        $('#cdNombreEncuesta').text(e.Nombre);
        document.title = e.Nombre + ' - Captura dinámica';
        $('#cdBadgeEstatus').html(ui.badgeEstatus(e.Estatus));
        $('#cdBadgeVersion').html('<i class="bi bi-clock-history me-1"></i>Versión ' + e.NumeroVersion);
        $('#cdBadgeSucio').toggleClass('cd-oculto', !S.sucio);

        // Avisos de versionado
        var aviso = '';
        var ultima = e.Versiones && e.Versiones.length ? e.Versiones[0] : null;
        if (ultima && ultima.IdVersion !== e.IdVersion) {
            aviso = '<i class="bi bi-clock-history me-1"></i>Estás viendo la <strong>versión ' + e.NumeroVersion + '</strong> (' + e.Estatus.toLowerCase() +
                '), la más reciente es la versión ' + ultima.NumeroVersion + '. Si guardas, estas preguntas se copiarán a un borrador.';
        } else if (e.TotalRespuestas > 0 && e.Estatus !== 'Borrador') {
            aviso = '<i class="bi bi-shield-lock me-1"></i>Esta versión ya tiene <strong>' + e.TotalRespuestas +
                ' respuestas</strong>. Al guardar cambios se creará una <strong>nueva versión</strong> en borrador y se conservará el histórico.';
        }
        $('#cdAvisoVersion').html(aviso).toggleClass('cd-oculto', !aviso);

        // Opciones del menú según estatus
        $('[data-cd-accion="cerrar"]').toggleClass('cd-oculto', e.Estatus !== 'Publicada');
        $('[data-cd-accion="reabrir"]').toggleClass('cd-oculto', e.Estatus !== 'Cerrada');
        $('[data-cd-accion="archivar"]').toggleClass('cd-oculto', e.Estatus === 'Archivada');
    }

    function renderVersiones() {
        var e = S.encuesta;
        var html = '';
        for (var i = 0; i < e.Versiones.length; i++) {
            var v = e.Versiones[i];
            var esActual = v.IdVersion === e.IdVersion;
            html += '<div class="cd-card mb-2' + (esActual ? ' border-dark' : '') + '"><div class="cd-card-body py-2">' +
                '<div class="d-flex justify-content-between align-items-center">' +
                '<strong>Versión ' + v.NumeroVersion + '</strong>' + ui.badgeEstatus(v.Estatus) + '</div>' +
                '<div class="small text-cd-muted mt-1">Creada ' + util.fecha(v.FechaCreacion) + (v.UsuarioCrea ? ' por ' + util.esc(v.UsuarioCrea) : '') +
                (v.FechaPublicacion ? '<br>Publicada ' + util.fecha(v.FechaPublicacion) : '') +
                '<br>' + v.TotalRespuestas + ' respuesta(s)</div>' +
                (esActual ? '<div class="small mt-1"><i class="bi bi-check2 me-1"></i>Versión abierta</div>'
                    : '<button type="button" class="btn btn-sm btn-cd-borde mt-2" data-cd-abrir-version="' + v.IdVersion + '">Abrir</button>') +
                '</div></div>';
        }
        $('#cdListaVersiones').html(html ||
            '<div class="text-cd-muted">Sin versiones.</div>');
    }

    // ==================================================================
    //  LISTA DE PREGUNTAS
    // ==================================================================
    /** Mapa clavePregunta -> [números de preguntas que la muestran/ocultan] */
    function mapaDependencias() {
        var lista = preguntas();
        var mapa = {};
        for (var i = 0; i < lista.length; i++) {
            for (var j = 0; j < lista[i].Reglas.length; j++) {
                var r = lista[i].Reglas[j];
                if ((r.Accion === 'mostrar' || r.Accion === 'ocultar') && r.ClaveDestino) {
                    mapa[r.ClaveDestino] = mapa[r.ClaveDestino] || [];
                    if (!util.contiene(mapa[r.ClaveDestino], i + 1)) { mapa[r.ClaveDestino].push(i + 1); }
                }
            }
        }
        return mapa;
    }

    function renderLista() {
        var lista = preguntas();
        var dep = mapaDependencias();
        var html = [];
        $('#cdTotalPreguntas').text(lista.length);

        if (lista.length === 0) {
            $('#cdListaPreguntas').html('<li class="cd-vacio"><i class="bi bi-ui-checks-grid"></i>Aún no hay preguntas.<br>Usa «Agregar pregunta» para comenzar.</li>');
            return;
        }

        for (var i = 0; i < lista.length; i++) {
            var p = lista[i];
            var t = CD.tipo(p.Tipo);
            var sel = p.Clave === S.sel;
            var badges = '';
            if (p.EsLlave) { badges += '<span class="cd-badge cd-badge-llave" title="Campo llave"><i class="bi bi-key me-1"></i>Llave</span>'; }
            if (p.Obligatoria) { badges += '<span class="cd-badge cd-badge-obligatoria">Obligatoria</span>'; }
            if (p.Tipo === 'fecha' && p.PermitirCalendario) { badges += '<span class="cd-badge cd-badge-calendario" title="Se puede enviar al calendario"><i class="bi bi-calendar-plus me-1"></i>Outlook</span>'; }
            if (p.Reglas.length) { badges += '<span class="cd-badge cd-badge-logica" title="Reglas de lógica"><i class="bi bi-signpost-split me-1"></i>' + p.Reglas.length + '</span>'; }
            if (dep[p.Clave]) { badges += '<span class="cd-badge cd-badge-depende"><i class="bi bi-eye me-1"></i>Depende de P' + dep[p.Clave].join(', P') + '</span>'; }

            html.push('<li class="cd-item-pregunta' + (sel ? ' seleccionada' : '') + '" draggable="true" data-clave="' + util.esc(p.Clave) + '">' +
                '<span class="cd-grip" title="Arrastra para reordenar"><i class="bi bi-grip-vertical"></i></span>' +
                '<span class="cd-num' + (sel ? ' rojo' : '') + '">' + (i + 1) + '</span>' +
                '<div class="cd-item-cuerpo">' +
                '<div class="cd-item-tipo"><i class="bi ' + t.icono + ' me-1"></i>' + t.nombre + '</div>' +
                '<div class="cd-item-texto">' + (util.vacio(p.Texto) ? '<em class="text-cd-muted">Sin texto</em>' : util.esc(p.Texto)) + '</div>' +
                (badges ? '<div class="cd-item-badges">' + badges + '</div>' : '') +
                '</div>' +
                '<div class="cd-menu">' +
                '<button type="button" class="btn btn-sm border-0 px-1" data-cd-menu title="Acciones"><i class="bi bi-three-dots-vertical"></i></button>' +
                '<div class="cd-menu-lista">' +
                '<button type="button" class="cd-menu-item" data-cd-item="editar"><i class="bi bi-pencil"></i>Editar</button>' +
                '<button type="button" class="cd-menu-item" data-cd-item="duplicar"><i class="bi bi-files"></i>Duplicar</button>' +
                '<button type="button" class="cd-menu-item" data-cd-item="subir"' + (i === 0 ? ' disabled' : '') + '><i class="bi bi-arrow-up"></i>Subir</button>' +
                '<button type="button" class="cd-menu-item" data-cd-item="bajar"' + (i === lista.length - 1 ? ' disabled' : '') + '><i class="bi bi-arrow-down"></i>Bajar</button>' +
                '<button type="button" class="cd-menu-item" data-cd-item="obligatoria"><i class="bi bi-asterisk"></i>' + (p.Obligatoria ? 'Quitar obligatoria' : 'Marcar obligatoria') + '</button>' +
                '<div class="cd-menu-sep"></div>' +
                '<button type="button" class="cd-menu-item peligro" data-cd-item="eliminar"><i class="bi bi-trash"></i>Eliminar</button>' +
                '</div></div>' +
                '</li>');
        }
        $('#cdListaPreguntas').html(html.join(''));
    }

    function seleccionar(clave) {
        if (S.sel === clave) { return; }
        S.sel = clave;
        renderLista();
        renderPanel();
        renderPreviewPregunta();
        // En pantallas chicas lleva al panel
        if ($(window).width() < 992) {
            $('html, body').animate({ scrollTop: $('#cdPanelCard').offset().top - 70 }, 200);
        }
    }

    // ==================================================================
    //  PANEL DE CONFIGURACIÓN DE LA PREGUNTA
    // ==================================================================
    function renderPanel() {
        var p = actual();
        var $panel = $('#cdPanelPregunta');
        $('#cdPanelBotones').toggleClass('cd-oculto', !p);
        if (!p) {
            $('#cdPanelNumero').text('');
            $panel.html('<div class="cd-vacio"><i class="bi bi-hand-index"></i>Selecciona una pregunta de la lista o agrega una nueva.' +
                '<div class="mt-3"><button type="button" class="btn btn-cd-rojo" data-cd-abrir-tipos="1"><i class="bi bi-plus-lg me-1"></i>Agregar pregunta</button></div></div>');
            return;
        }
        var idx = indiceDe(p.Clave);
        var t = CD.tipo(p.Tipo);
        $('#cdPanelNumero').text('P' + (idx + 1));
        $('#cdBtnSubir').prop('disabled', idx === 0);
        $('#cdBtnBajar').prop('disabled', idx === preguntas().length - 1);

        var opcionesTipo = '';
        for (var i = 0; i < CD.tipos.length; i++) {
            opcionesTipo += '<option value="' + CD.tipos[i].clave + '"' + (CD.tipos[i].clave === p.Tipo ? ' selected' : '') + '>' + CD.tipos[i].nombre + '</option>';
        }

        var html = '';
        html += '<div class="cd-campo"><label class="cd-label">Tipo de pregunta</label>' +
            '<div class="cd-tipo-select"><span class="cd-tipo-icono"><i class="bi ' + t.icono + '"></i></span>' +
            '<select class="form-select" id="cdPanelTipo">' + opcionesTipo + '</select></div></div>';
        html += '<div class="cd-campo"><label class="cd-label">Pregunta</label>' +
            '<textarea class="form-control" rows="2" maxlength="500" data-campo="Texto" placeholder="Escribe la pregunta">' + util.esc(p.Texto) + '</textarea></div>';
        html += '<div class="cd-campo"><label class="cd-label">Descripción <span class="opcional">(opcional)</span></label>' +
            '<input type="text" class="form-control" maxlength="300" data-campo="Descripcion" placeholder="Instrucción breve para quien responde" value="' + util.esc(p.Descripcion) + '"></div>';

        html += htmlSeccionTipo(p);
        html += htmlSwitches(p);

        var validaciones = htmlValidaciones(p);
        if (validaciones) {
            html += htmlAcordeon('validaciones', '<i class="bi bi-check2-square me-2"></i>Validaciones', validaciones);
        }
        html += htmlAcordeon('logica', '<i class="bi bi-signpost-split me-2"></i>Lógica condicional' +
            (p.Reglas.length ? ' <span class="cd-contador">' + p.Reglas.length + '</span>' : ''), htmlLogica(p));

        $panel.html('<fieldset>' + html + '</fieldset>');
    }

    function htmlAcordeon(id, titulo, cuerpo) {
        return '<div class="cd-acordeon' + (S.abiertos[id] ? ' abierto' : '') + '" data-cd-acordeon="' + id + '">' +
            '<button type="button" class="cd-acordeon-boton"><span>' + titulo + '</span><i class="bi bi-chevron-down cd-chevron"></i></button>' +
            '<div class="cd-acordeon-cuerpo">' + cuerpo + '</div></div>';
    }

    function htmlSwitch(campo, etiqueta, valor, rerender) {
        var id = 'cdSw' + campo;
        return '<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="' + id + '" data-campo="' + campo +
            '" data-valor="bool"' + (rerender ? ' data-rerender="1"' : '') + (valor ? ' checked' : '') + '>' +
            '<label class="form-check-label" for="' + id + '">' + etiqueta + '</label></div>';
    }

    function htmlSwitches(p) {
        var t = CD.tipo(p.Tipo);
        var html = htmlSwitch('Obligatoria', 'Obligatoria', p.Obligatoria);
        if (t.usaOpciones && !t.opcionesFijas) { html += htmlSwitch('OrdenAleatorio', 'Orden aleatorio de opciones', p.OrdenAleatorio); }
        if (t.permiteOtro) { html += htmlSwitch('PermitirOtro', 'Permitir «Otro»', p.PermitirOtro, true); }
        if (puedeSerLlave(p.Tipo)) {
            html += htmlSwitch('EsLlave', '<i class="bi bi-key me-1"></i>Campo llave', p.EsLlave, true);
        }
        var nota = '';
        if (p.EsLlave) {
            nota = '<div class="small text-cd-muted mb-3" style="margin-top:-8px"><i class="bi bi-info-circle me-1"></i>' +
                'Al capturar este dato se busca la última captura con el mismo valor y se cargan sus respuestas. ' +
                'Solo puede haber un campo llave por encuesta y siempre es obligatorio.</div>';
        }
        return '<div class="cd-switches">' + html + '</div>' + nota;
    }

    /** Sección "Calendario de Outlook" de las preguntas de fecha. */
    function htmlCalendario(p) {
        var html = htmlSwitch('PermitirCalendario', '<i class="bi bi-calendar-plus me-1"></i>Permitir enviar al calendario de Outlook', p.PermitirCalendario, true);
        if (!p.PermitirCalendario) {
            return '<div class="cd-campo">' + html + '<div class="small text-cd-muted mt-1">Al enviar, quien responde puede descargar la fecha como cita para Outlook (.ics).</div></div>';
        }
        var duraciones = [[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [90, '1 hora 30 min'], [120, '2 horas'], [240, '4 horas']];
        var opciones = '';
        for (var i = 0; i < duraciones.length; i++) {
            opciones += '<option value="' + duraciones[i][0] + '"' + ((p.CalendarioDuracion || 60) === duraciones[i][0] ? ' selected' : '') + '>' + duraciones[i][1] + '</option>';
        }
        html += '<div class="mt-2">' + htmlSwitch('CalendarioPedirHora', 'Pedir hora (opcional para quien responde)', p.CalendarioPedirHora, true) + '</div>' +
            '<div class="row g-2 mt-1">' +
            '<div class="col-md-8"><label class="small text-cd-muted">Título del evento</label>' +
            '<input type="text" class="form-control form-control-sm" maxlength="150" data-campo="CalendarioTitulo" value="' + util.esc(p.CalendarioTitulo) +
            '" placeholder="Si se deja vacío se usa el texto de la pregunta"></div>' +
            (p.CalendarioPedirHora
                ? '<div class="col-md-4"><label class="small text-cd-muted">Duración</label><select class="form-select form-select-sm" data-campo="CalendarioDuracion" data-valor="entero">' + opciones + '</select></div>'
                : '') +
            '</div><div class="small text-cd-muted mt-2">' +
            (p.CalendarioPedirHora ? 'Si no capturan hora, la cita se crea como evento de todo el día.' : 'La cita se crea como evento de todo el día.') +
            ' Incluye un recordatorio 15 minutos antes.</div>';
        return '<div class="cd-campo border rounded p-3">' + html + '</div>';
    }

    /** Editor de una lista simple (Opciones, Filas o Columnas). */
    function htmlListaOpciones(p, lista, titulo, textoAgregar, fijas) {
        var items = p[lista];
        var html = '<div class="cd-campo"><label class="cd-label">' + titulo + '</label>';
        for (var i = 0; i < items.length; i++) {
            html += '<div class="cd-opcion-fila">' +
                '<span class="cd-grip"><i class="bi bi-grip-vertical"></i></span>' +
                '<input type="text" class="form-control form-control-sm" maxlength="200" data-lista="' + lista + '" data-idx="' + i + '" value="' + util.esc(items[i].Texto) + '">' +
                (fijas ? '' : '<button type="button" class="btn-cd-quitar" title="Quitar" data-cd-op="quitar-opcion" data-lista="' + lista + '" data-idx="' + i + '"' +
                    (items.length <= 1 ? ' disabled' : '') + '><i class="bi bi-trash"></i></button>') +
                '</div>';
        }
        if (lista === 'Opciones' && p.PermitirOtro) {
            html += '<div class="cd-opcion-fila cd-opcion-otro"><span class="cd-grip"><i class="bi bi-dot"></i></span>' +
                '<input type="text" class="form-control form-control-sm" value="Otro (el usuario escribe su respuesta)" disabled></div>';
        }
        if (!fijas) {
            html += '<button type="button" class="btn-cd-link" data-cd-op="agregar-opcion" data-lista="' + lista + '"><i class="bi bi-plus-lg me-1"></i>' + textoAgregar + '</button>';
        }
        return html + '</div>';
    }

    function htmlSeccionTipo(p) {
        var html = '';
        var i;
        switch (p.Tipo) {
            case 'unica':
            case 'multiple':
            case 'desplegable':
                html = htmlListaOpciones(p, 'Opciones', 'Opciones de respuesta', 'Agregar opción', false);
                break;

            case 'sino':
                html = htmlListaOpciones(p, 'Opciones', 'Etiquetas de las opciones', '', true);
                break;

            case 'texto':
                if (p.EsLlave) { html = ''; break; }    // el campo llave siempre es respuesta corta
                html = '<div class="cd-campo"><label class="cd-label">Tipo de campo</label>' +
                    '<div class="btn-group" role="group">' +
                    '<button type="button" class="btn btn-sm ' + (!p.TextoLargo ? 'btn-dark' : 'btn-outline-dark') + '" data-cd-op="texto-largo" data-valor="0"><i class="bi bi-input-cursor me-1"></i>Respuesta corta</button>' +
                    '<button type="button" class="btn btn-sm ' + (p.TextoLargo ? 'btn-dark' : 'btn-outline-dark') + '" data-cd-op="texto-largo" data-valor="1"><i class="bi bi-text-paragraph me-1"></i>Párrafo</button>' +
                    '</div></div>';
                break;

            case 'escala':
                var desde = '';
                var hasta = '';
                for (i = 0; i <= 1; i++) { desde += '<option value="' + i + '"' + (p.EscalaMinimo === i ? ' selected' : '') + '>' + i + '</option>'; }
                for (i = 2; i <= 10; i++) { hasta += '<option value="' + i + '"' + (p.EscalaMaximo === i ? ' selected' : '') + '>' + i + '</option>'; }
                html = '<div class="cd-campo"><label class="cd-label">Escala</label>' +
                    '<div class="mb-2">' +
                    '<button type="button" class="btn btn-sm btn-outline-dark me-1" data-cd-op="escala" data-min="1" data-max="5">1 a 5</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-dark me-1" data-cd-op="escala" data-min="1" data-max="10">1 a 10</button>' +
                    '<button type="button" class="btn btn-sm btn-outline-dark" data-cd-op="escala" data-min="0" data-max="10">0 a 10</button></div>' +
                    '<div class="row g-2">' +
                    '<div class="col-6 col-md-3"><label class="small text-cd-muted">Desde</label><select class="form-select form-select-sm" data-campo="EscalaMinimo" data-valor="entero">' + desde + '</select></div>' +
                    '<div class="col-6 col-md-3"><label class="small text-cd-muted">Hasta</label><select class="form-select form-select-sm" data-campo="EscalaMaximo" data-valor="entero">' + hasta + '</select></div>' +
                    '<div class="col-6 col-md-3"><label class="small text-cd-muted">Etiqueta inicial</label><input type="text" class="form-control form-control-sm" maxlength="40" data-campo="EtiquetaMinimo" value="' + util.esc(p.EtiquetaMinimo) + '" placeholder="Ej. Nada probable"></div>' +
                    '<div class="col-6 col-md-3"><label class="small text-cd-muted">Etiqueta final</label><input type="text" class="form-control form-control-sm" maxlength="40" data-campo="EtiquetaMaximo" value="' + util.esc(p.EtiquetaMaximo) + '" placeholder="Ej. Muy probable"></div>' +
                    '</div></div>';
                break;

            case 'matriz':
                html = '<div class="row">' +
                    '<div class="col-md-6">' + htmlListaOpciones(p, 'Filas', 'Filas (aspectos a evaluar)', 'Agregar fila', false) + '</div>' +
                    '<div class="col-md-6">' + htmlListaOpciones(p, 'Columnas', 'Columnas (escala)', 'Agregar columna', false) + '</div>' +
                    '</div><div class="small text-cd-muted mb-3"><i class="bi bi-info-circle me-1"></i>Cada fila permite seleccionar una sola columna.</div>';
                break;

            case 'dependiente':
                html = htmlDependienteEditor(p);
                break;

            case 'fecha':
                html = htmlCalendario(p);
                break;

            case 'numero':
                html = '';
                break;
        }
        return html;
    }

    /** Validaciones (mín/máx) según el tipo. Regresa '' si el tipo no tiene. */
    function htmlValidaciones(p) {
        function num(campo, etiqueta, valor, tipo) {
            return '<div class="col-6"><label class="small text-cd-muted">' + etiqueta + '</label>' +
                '<input type="' + (tipo === 'fecha' ? 'date' : 'number') + '" class="form-control form-control-sm" min="0" data-campo="' + campo + '" data-valor="' + (tipo || 'entero') +
                '" value="' + (valor === null || valor === undefined ? '' : util.esc(valor)) + '" placeholder="Sin límite"></div>';
        }
        switch (p.Tipo) {
            case 'texto':
                return '<div class="row g-2">' + num('MinCaracteres', 'Mínimo de caracteres', p.MinCaracteres) + num('MaxCaracteres', 'Máximo de caracteres', p.MaxCaracteres) + '</div>' +
                    '<div class="small text-cd-muted mt-2">Quien responde verá un contador de caracteres.</div>';
            case 'multiple':
                return '<div class="row g-2">' + num('MinSelecciones', 'Mínimo de selecciones', p.MinSelecciones) + num('MaxSelecciones', 'Máximo de selecciones', p.MaxSelecciones) + '</div>';
            case 'numero':
                return '<div class="row g-2">' + num('ValorMinimo', 'Valor mínimo', p.ValorMinimo, 'numero') + num('ValorMaximo', 'Valor máximo', p.ValorMaximo, 'numero') + '</div>' +
                    '<div class="mt-2">' + htmlSwitch('PermitirDecimales', 'Permitir decimales', p.PermitirDecimales) + '</div>';
            case 'fecha':
                return '<div class="row g-2">' + num('FechaMinima', 'Fecha mínima', p.FechaMinima, 'fecha') + num('FechaMaxima', 'Fecha máxima', p.FechaMaxima, 'fecha') + '</div>';
        }
        return '';
    }

    // ---------- Editor de multiselección dependiente ----------
    function rutaActiva(p) {
        var activos = S.depActivo[p.Clave] || [];
        var niveles = p.Niveles;
        var ruta = [];
        for (var n = 0; n < niveles.length - 1; n++) {
            var padre = n === 0 ? null : ruta[n - 1];
            var candidatas = opcionesDeNivel(p, niveles[n].Nivel, padre);
            var elegida = activos[n] && util.buscar(candidatas, 'Clave', activos[n]) ? activos[n] : (candidatas.length ? candidatas[0].Clave : null);
            ruta.push(elegida);
            if (!elegida) { break; }
        }
        S.depActivo[p.Clave] = ruta;
        return ruta;
    }

    function opcionesDeNivel(p, nivel, clavePadre) {
        var lista = [];
        for (var i = 0; i < p.OpcionesDependientes.length; i++) {
            var o = p.OpcionesDependientes[i];
            if (o.Nivel === nivel && (nivel === 1 || o.ClavePadre === clavePadre)) { lista.push(o); }
        }
        return lista;
    }

    function htmlDependienteEditor(p) {
        var html = '<div class="cd-campo"><label class="cd-label">Niveles</label>';
        var i;
        for (i = 0; i < p.Niveles.length; i++) {
            var nv = p.Niveles[i];
            html += '<div class="cd-opcion-fila"><span class="cd-num me-2">' + nv.Nivel + '</span>' +
                '<input type="text" class="form-control form-control-sm" maxlength="60" data-dep-nivel-nombre="' + i + '" value="' + util.esc(nv.Nombre) + '" placeholder="Nombre del nivel">' +
                '<div class="form-check form-switch ms-3 mb-0 text-nowrap"><input class="form-check-input" type="checkbox" id="cdDepMul' + i + '" data-dep-nivel-multiple="' + i + '"' +
                (nv.PermitirMultiple ? ' checked' : '') + '><label class="form-check-label small" for="cdDepMul' + i + '">Selección múltiple</label></div>' +
                (i === p.Niveles.length - 1 && p.Niveles.length > 1
                    ? '<button type="button" class="btn-cd-quitar" title="Quitar nivel" data-cd-op="quitar-nivel"><i class="bi bi-trash"></i></button>'
                    : '<span style="width:32px"></span>') +
                '</div>';
        }
        if (p.Niveles.length < 5) {
            html += '<button type="button" class="btn-cd-link" data-cd-op="agregar-nivel"><i class="bi bi-plus-lg me-1"></i>Agregar nivel</button>';
        }
        html += '</div>';

        // Columnas en cascada
        var ruta = rutaActiva(p);
        html += '<div class="cd-campo"><label class="cd-label">Opciones por nivel</label>' +
            '<div class="small text-cd-muted mb-2">Haz clic en <i class="bi bi-chevron-right"></i> para editar las opciones que dependen de esa opción.</div>' +
            '<div class="cd-dep-columnas">';
        for (i = 0; i < p.Niveles.length; i++) {
            var nivel = p.Niveles[i];
            var padre = i === 0 ? null : ruta[i - 1];
            var padreObj = padre ? util.buscar(p.OpcionesDependientes, 'Clave', padre) : null;
            html += '<div class="cd-dep-columna"><div class="cd-dep-columna-header"><strong class="small">' + util.esc(nivel.Nombre || ('Nivel ' + nivel.Nivel)) + '</strong>' +
                (padreObj ? '<div class="small text-cd-muted text-truncate">de «' + util.esc(padreObj.Texto) + '»</div>' : '<div class="small text-cd-muted">&nbsp;</div>') +
                '</div><div class="cd-dep-columna-body">';
            if (i > 0 && !padre) {
                html += '<div class="small text-cd-muted">Agrega primero opciones en el nivel anterior.</div>';
            } else {
                var ops = opcionesDeNivel(p, nivel.Nivel, padre);
                for (var j = 0; j < ops.length; j++) {
                    var activa = ruta[i] === ops[j].Clave;
                    html += '<div class="cd-dep-opcion' + (activa ? ' activa' : '') + '">' +
                        '<input type="text" class="form-control form-control-sm" maxlength="120" data-dep-opcion="' + util.esc(ops[j].Clave) + '" value="' + util.esc(ops[j].Texto) + '">' +
                        '<button type="button" class="btn-cd-quitar" title="Quitar" data-cd-op="dep-quitar" data-clave="' + util.esc(ops[j].Clave) + '"><i class="bi bi-trash"></i></button>' +
                        (i < p.Niveles.length - 1 ? '<button type="button" class="btn-cd-hijos" title="Ver opciones dependientes" data-cd-op="dep-activar" data-nivel="' + i + '" data-clave="' + util.esc(ops[j].Clave) + '"><i class="bi bi-chevron-right"></i></button>' : '') +
                        '</div>';
                }
                html += '<button type="button" class="btn-cd-link small" data-cd-op="dep-agregar" data-nivel="' + i + '"><i class="bi bi-plus-lg me-1"></i>Agregar</button>';
            }
            html += '</div></div>';
        }
        return html + '</div></div>';
    }

    /** Elimina una opción dependiente y todas sus descendientes. Regresa las claves eliminadas. */
    function quitarOpcionDependiente(p, clave) {
        var eliminar = [clave];
        var cambio = true;
        while (cambio) {
            cambio = false;
            for (var i = 0; i < p.OpcionesDependientes.length; i++) {
                var o = p.OpcionesDependientes[i];
                if (o.ClavePadre && util.contiene(eliminar, o.ClavePadre) && !util.contiene(eliminar, o.Clave)) {
                    eliminar.push(o.Clave);
                    cambio = true;
                }
            }
        }
        var restantes = [];
        for (var j = 0; j < p.OpcionesDependientes.length; j++) {
            if (!util.contiene(eliminar, p.OpcionesDependientes[j].Clave)) { restantes.push(p.OpcionesDependientes[j]); }
        }
        p.OpcionesDependientes = restantes;
        return eliminar;
    }

    /** Quita las reglas de la pregunta cuyo valor ya no existe. */
    function quitarReglasPorValor(p, claves) {
        var antes = p.Reglas.length;
        var nuevas = [];
        for (var i = 0; i < p.Reglas.length; i++) {
            if (!util.contiene(claves, p.Reglas[i].Valor)) { nuevas.push(p.Reglas[i]); }
        }
        p.Reglas = nuevas;
        if (antes !== nuevas.length) { ui.toast('Se quitaron ' + (antes - nuevas.length) + ' regla(s) que usaban esa opción.', 'info'); }
    }

    // ==================================================================
    //  LÓGICA CONDICIONAL (editor de reglas)
    // ==================================================================
    function operadoresPara(tipo) {
        switch (tipo) {
            case 'unica': case 'desplegable': case 'sino':
                return [['igual', 'es'], ['distinto', 'no es']];
            case 'multiple': case 'dependiente': case 'matriz':
                return [['contiene', 'incluye'], ['distinto', 'no incluye']];
            case 'escala': case 'numero':
                return [['igual', 'es igual a'], ['distinto', 'es distinto de'], ['mayor', 'es mayor que'], ['menor', 'es menor que']];
            case 'fecha':
                return [['igual', 'es'], ['mayor', 'es posterior a'], ['menor', 'es anterior a']];
            case 'texto':
                return [['igual', 'es igual a'], ['contiene', 'contiene'], ['distinto', 'es distinto de']];
        }
        return [['igual', 'es']];
    }

    function etiquetaOperador(tipo, op) {
        var lista = operadoresPara(tipo);
        for (var i = 0; i < lista.length; i++) { if (lista[i][0] === op) { return lista[i][1]; } }
        return CD.operadores[op] || op;
    }

    /** Valores posibles de la condición: [[valor, texto]] o null si es captura libre. */
    function valoresPara(p) {
        var lista = [];
        var i;
        switch (p.Tipo) {
            case 'unica': case 'multiple': case 'desplegable': case 'sino':
                for (i = 0; i < p.Opciones.length; i++) { lista.push([p.Opciones[i].Clave, p.Opciones[i].Texto]); }
                if (p.PermitirOtro) { lista.push([CD.CLAVE_OTRO, 'Otro']); }
                return lista;
            case 'matriz':
                for (i = 0; i < p.Columnas.length; i++) { lista.push([p.Columnas[i].Clave, p.Columnas[i].Texto]); }
                return lista;
            case 'dependiente':
                for (i = 0; i < p.OpcionesDependientes.length; i++) {
                    var o = p.OpcionesDependientes[i];
                    var nivel = util.buscar(p.Niveles, 'Nivel', o.Nivel);
                    lista.push([o.Clave, (nivel ? nivel.Nombre + ': ' : '') + o.Texto]);
                }
                return lista;
            case 'escala':
                var min = p.EscalaMinimo === null ? 1 : p.EscalaMinimo;
                var max = p.EscalaMaximo === null ? 5 : p.EscalaMaximo;
                for (i = min; i <= max; i++) { lista.push([String(i), String(i)]); }
                return lista;
        }
        return null;
    }

    function textoValor(p, valor) {
        var valores = valoresPara(p);
        if (valores) {
            for (var i = 0; i < valores.length; i++) { if (valores[i][0] === valor) { return valores[i][1]; } }
            return '(opción eliminada)';
        }
        if (p.Tipo === 'fecha') { return util.fecha(valor); }
        return valor;
    }

    /** Regresa el problema de la regla o null si es válida. */
    function problemaRegla(p, r) {
        if (util.vacio(r.Valor)) { return 'Falta indicar el valor de la condición.'; }
        var valores = valoresPara(p);
        if (valores) {
            var existe = false;
            for (var i = 0; i < valores.length; i++) { if (valores[i][0] === r.Valor) { existe = true; } }
            if (!existe) { return 'La opción de la condición ya no existe.'; }
        }
        if (r.Accion !== 'finalizar') {
            var io = indiceDe(p.Clave);
            var id = indiceDe(r.ClaveDestino);
            if (id < 0) { return 'Selecciona la pregunta destino.'; }
            if (id <= io) { return 'La pregunta destino debe estar después de esta pregunta.'; }
        }
        return null;
    }

    function htmlLogica(p) {
        var html = '<div class="small text-cd-muted mb-3">Define qué pasa según la respuesta. Ejemplo: <em>Si la respuesta es «Sí» → Mostrar P5</em>.</div>';
        var idx = indiceDe(p.Clave);
        var siguientes = preguntas().slice(idx + 1);
        var ops = operadoresPara(p.Tipo);
        var valores = valoresPara(p);
        var i, j;

        for (i = 0; i < p.Reglas.length; i++) {
            var r = p.Reglas[i];
            var problema = problemaRegla(p, r);

            var selOp = '<select class="form-select form-select-sm" data-regla="' + i + '" data-regla-campo="Operador">';
            for (j = 0; j < ops.length; j++) { selOp += '<option value="' + ops[j][0] + '"' + (r.Operador === ops[j][0] ? ' selected' : '') + '>' + ops[j][1] + '</option>'; }
            selOp += '</select>';

            var ctlValor;
            if (valores) {
                ctlValor = '<select class="form-select form-select-sm" data-regla="' + i + '" data-regla-campo="Valor"><option value="">Selecciona...</option>';
                for (j = 0; j < valores.length; j++) { ctlValor += '<option value="' + util.esc(valores[j][0]) + '"' + (r.Valor === valores[j][0] ? ' selected' : '') + '>' + util.esc(valores[j][1]) + '</option>'; }
                ctlValor += '</select>';
            } else {
                var tipoInput = p.Tipo === 'numero' ? 'number' : (p.Tipo === 'fecha' ? 'date' : 'text');
                ctlValor = '<input type="' + tipoInput + '" class="form-control form-control-sm" data-regla="' + i + '" data-regla-campo="Valor" value="' + util.esc(r.Valor) + '" placeholder="Valor">';
            }

            var selAccion = '<select class="form-select form-select-sm" data-regla="' + i + '" data-regla-campo="Accion" data-rerender="1">';
            for (j = 0; j < CD.acciones.length; j++) {
                selAccion += '<option value="' + CD.acciones[j].clave + '"' + (r.Accion === CD.acciones[j].clave ? ' selected' : '') + '>' + CD.acciones[j].nombre + '</option>';
            }
            selAccion += '</select>';

            var selDestino = '';
            if (r.Accion !== 'finalizar') {
                selDestino = '<select class="form-select form-select-sm" data-regla="' + i + '" data-regla-campo="ClaveDestino"><option value="">Pregunta...</option>';
                for (j = 0; j < siguientes.length; j++) {
                    var texto = siguientes[j].Texto || '(sin texto)';
                    if (texto.length > 45) { texto = texto.substring(0, 45) + '…'; }
                    selDestino += '<option value="' + util.esc(siguientes[j].Clave) + '"' + (r.ClaveDestino === siguientes[j].Clave ? ' selected' : '') + '>P' +
                        (idx + 2 + j) + ' · ' + util.esc(texto) + '</option>';
                }
                selDestino += '</select>';
            }

            html += '<div class="cd-regla' + (problema ? ' invalida' : '') + '">' +
                '<div class="cd-regla-linea"><span class="cd-regla-palabra">Si la respuesta</span>' + selOp + ctlValor + '</div>' +
                '<div class="cd-regla-linea"><span class="cd-regla-flecha"><i class="bi bi-arrow-return-right"></i></span><span class="cd-regla-palabra">Entonces</span>' +
                selAccion + selDestino +
                '<button type="button" class="btn btn-cd-icono peligro ms-auto" title="Quitar regla" data-cd-op="quitar-regla" data-idx="' + i + '"><i class="bi bi-trash"></i></button></div>' +
                (problema ? '<div class="small text-cd-red mt-1"><i class="bi bi-exclamation-triangle me-1"></i>' + problema + '</div>' : '') +
                '</div>';
        }
        if (p.Tipo === 'texto' || p.Tipo === 'numero' || p.Tipo === 'fecha') {
            html += '<div class="small text-cd-muted mb-2">Para este tipo la condición compara el valor capturado.</div>';
        }
        html += '<button type="button" class="btn-cd-link" data-cd-op="agregar-regla"><i class="bi bi-plus-lg me-1"></i>Agregar regla</button>';
        return html;
    }

    function agregarRegla(p) {
        var valores = valoresPara(p);
        var idx = indiceDe(p.Clave);
        var siguiente = preguntas()[idx + 1];
        p.Reglas.push({
            Clave: util.clave('r'),
            Operador: operadoresPara(p.Tipo)[0][0],
            Valor: valores && valores.length ? valores[0][0] : '',
            Accion: siguiente ? 'mostrar' : 'finalizar',
            ClaveDestino: siguiente ? siguiente.Clave : null
        });
        S.abiertos.logica = true;
        marcarSucio();
        renderPanel();
        renderLista();
        renderLogica();
        renderPreviewPregunta();
    }

    // ==================================================================
    //  RESUMEN DE LÓGICA (tarjeta "Lógica de la encuesta")
    // ==================================================================
    function renderLogica() {
        var lista = preguntas();
        var html = '';
        for (var i = 0; i < lista.length; i++) {
            var p = lista[i];
            if (!p.Reglas.length) { continue; }
            html += '<div class="cd-logica-bloque" role="button" data-cd-ir-logica="' + util.esc(p.Clave) + '">' +
                '<div><span class="cd-num me-1">P' + (i + 1) + '</span> <strong class="small">' + util.esc(p.Texto || '(sin texto)') + '</strong></div><ul>';
            for (var j = 0; j < p.Reglas.length; j++) {
                var r = p.Reglas[j];
                var problema = problemaRegla(p, r);
                var accion = util.buscar(CD.acciones, 'clave', r.Accion) || CD.acciones[0];
                var destino = r.Accion === 'finalizar' ? '' : ' <span class="cd-chip">P' + (indiceDe(r.ClaveDestino) + 1) + '</span>';
                html += '<li' + (problema ? ' class="text-cd-red" title="' + util.esc(problema) + '"' : '') + '>' +
                    (problema ? '<i class="bi bi-exclamation-triangle me-1"></i>' : '') +
                    'Si la respuesta <strong>' + etiquetaOperador(p.Tipo, r.Operador) + '</strong> «' + util.esc(textoValor(p, r.Valor)) + '» ' +
                    '<span class="cd-regla-flecha">→</span> <i class="bi ' + accion.icono + '"></i> ' + accion.nombre.replace(' pregunta', '') + destino + '</li>';
            }
            html += '</ul></div>';
        }
        $('#cdResumenLogica').html(html || '<div class="small text-cd-muted">Aún no hay reglas. Selecciona una pregunta y usa «Lógica condicional» para agregar una.</div>');
    }

    // ==================================================================
    //  VISTA PREVIA DE LA PREGUNTA SELECCIONADA + CATÁLOGO DE TIPOS
    // ==================================================================
    function renderPreviewPregunta() {
        var p = actual();
        var $c = $('#cdPreviewPregunta');
        if (!p) { $c.html('<div class="text-cd-muted small">Sin pregunta seleccionada.</div>'); return; }
        var r = new CD.Renderer($c, { Preguntas: [p], Publicacion: {} },
            { modo: 'preview', soloPreguntas: true, prefijo: 'mini', numeroBase: indiceDe(p.Clave) });
        r.render();
    }

    function renderTipos() {
        var html = '';
        for (var i = 0; i < CD.tipos.length; i++) {
            var t = CD.tipos[i];
            html += '<div class="cd-tipo-item"><button type="button" class="cd-tipo-boton" data-cd-agregar-tipo="' + t.clave + '">' +
                '<span class="cd-tipo-ic"><i class="bi ' + t.icono + '"></i></span><span><strong>' + t.nombre + '</strong><span>' + t.desc + '</span></span>' +
                '</button></div>';
        }
        $('#cdTiposGrid, #cdModalTiposGrid').html(html);
    }

    // ==================================================================
    //  CONFIGURACIÓN (publicación y segmentación)
    // ==================================================================
    function renderConfiguracion() {
        var e = S.encuesta;
        var pub = e.Publicacion;
        $('#cdCfgFechaInicio').val(pub.FechaInicio || '');
        $('#cdCfgFechaCierre').val(pub.FechaCierre || '');
        $('#cdCfgAnonima').prop('checked', !!pub.Anonima);
        $('#cdCfgAutenticado').prop('checked', !!pub.RequiereAutenticacion);
        $('#cdCfgMensajeInicial').val(pub.MensajeInicial || '');
        $('#cdCfgMensajeFinal').val(pub.MensajeFinal || '');
        $('#cdCfgDescripcion').val(e.Descripcion || '');
        $('#cdCfgPoblacion').val(e.PoblacionObjetivo || '');
        $('[data-cd-respuestas]').removeClass('activo');
        $('[data-cd-respuestas="' + (pub.RespuestaUnica ? '1' : '0') + '"]').addClass('activo');
        renderSegmentacion();
        sugerenciasSegmento();
        renderNotaLlave();
    }

    function renderSegmentacion() {
        var seg = S.encuesta.Segmentacion;
        var html = '';
        for (var i = 0; i < seg.length; i++) {
            var tipo = util.buscar(CD.segmentoTipos, 'clave', seg[i].Tipo);
            html += '<div class="d-flex align-items-center border rounded px-3 py-2 mb-2 bg-white">' +
                '<i class="bi bi-people me-2 text-cd-muted"></i><span class="text-cd-muted me-2">' + util.esc(tipo ? tipo.nombre : seg[i].Tipo) + ':</span>' +
                '<strong class="flex-grow-1">' + util.esc(seg[i].Valor) + '</strong>' +
                '<button type="button" class="btn btn-cd-icono peligro" data-cd-quitar-segmento="' + i + '" title="Quitar"><i class="bi bi-x-lg"></i></button></div>';
        }
        $('#cdSegLista').html(html || '<div class="small text-cd-muted mb-2"><i class="bi bi-globe me-1"></i>Sin reglas: la encuesta está disponible para todos los usuarios.</div>');
    }

    function sugerenciasSegmento() {
        var tipo = util.buscar(CD.segmentoTipos, 'clave', $('#cdSegTipo').val()) || CD.segmentoTipos[0];
        var html = '';
        for (var i = 0; i < tipo.ejemplos.length; i++) { html += '<option value="' + util.esc(tipo.ejemplos[i]) + '"></option>'; }
        $('#cdSegSugerencias').html(html);
        $('#cdSegValor').attr('placeholder', tipo.clave === 'Usuario' ? 'Número de empleado' : 'Escribe o elige un valor');
    }

    // ==================================================================
    //  VISTA PREVIA COMPLETA
    // ==================================================================
    function renderPreview() {
        var $marco = $('#cdPreviewMarco');
        $marco.removeClass('tablet movil');
        if (S.dispositivo !== 'desktop') { $marco.addClass(S.dispositivo); }
        $('[data-cd-dispositivo]').removeClass('activo');
        $('[data-cd-dispositivo="' + S.dispositivo + '"]').addClass('activo');
        var r = new CD.Renderer($('#cdPreviewContenido'), S.encuesta, { modo: 'preview', dispositivo: S.dispositivo, prefijo: 'pv' });
        r.render();
    }

    function mostrarTab(nombre) {
        S.tab = nombre;
        $('.cd-tab').removeClass('activo');
        $('.cd-tab[data-cd-tab="' + nombre + '"]').addClass('activo');
        $('.cd-tab-panel').addClass('cd-oculto');
        $('#cdTab-' + nombre).removeClass('cd-oculto');
        if (nombre === 'preview') { renderPreview(); }
        if (nombre === 'resultados') { CD.Resultados.cargar(S.id, null); }
    }

    // ==================================================================
    //  GUARDAR / PUBLICAR / ESTATUS
    // ==================================================================
    /** Validación previa a publicar. Regresa lista de {clave, mensaje}. */
    function validarParaPublicar() {
        var errores = [];
        var lista = preguntas();
        var e = S.encuesta;
        var i, j;
        if (!lista.length) { errores.push({ mensaje: 'Agrega al menos una pregunta.' }); }
        for (i = 0; i < lista.length; i++) {
            var p = lista[i];
            var n = 'P' + (i + 1) + ': ';
            var t = CD.tipo(p.Tipo);
            if (util.vacio(p.Texto)) { errores.push({ clave: p.Clave, mensaje: n + 'escribe el texto de la pregunta.' }); }
            if (t.usaOpciones) {
                var validas = 0;
                for (j = 0; j < p.Opciones.length; j++) { if (!util.vacio(p.Opciones[j].Texto)) { validas++; } }
                if (validas < 2) { errores.push({ clave: p.Clave, mensaje: n + 'necesita al menos 2 opciones con texto.' }); }
            }
            if (p.Tipo === 'matriz' && (p.Filas.length < 1 || p.Columnas.length < 2)) {
                errores.push({ clave: p.Clave, mensaje: n + 'la matriz necesita al menos 1 fila y 2 columnas.' });
            }
            if (p.Tipo === 'dependiente' && opcionesDeNivel(p, 1, null).length === 0) {
                errores.push({ clave: p.Clave, mensaje: n + 'agrega opciones al primer nivel.' });
            }
            if (p.MinSelecciones && p.MaxSelecciones && p.MinSelecciones > p.MaxSelecciones) {
                errores.push({ clave: p.Clave, mensaje: n + 'el mínimo de selecciones es mayor al máximo.' });
            }
            if (p.MinCaracteres && p.MaxCaracteres && p.MinCaracteres > p.MaxCaracteres) {
                errores.push({ clave: p.Clave, mensaje: n + 'el mínimo de caracteres es mayor al máximo.' });
            }
            for (j = 0; j < p.Reglas.length; j++) {
                var problema = problemaRegla(p, p.Reglas[j]);
                if (problema) { errores.push({ clave: p.Clave, mensaje: n + 'regla ' + (j + 1) + ': ' + problema }); }
            }
        }
        var pub = e.Publicacion;
        if (!pub.FechaInicio || !pub.FechaCierre) { errores.push({ tab: 'configuracion', mensaje: 'Configura la fecha de inicio y de cierre.' }); }
        else if (pub.FechaInicio > pub.FechaCierre) { errores.push({ tab: 'configuracion', mensaje: 'La fecha de cierre debe ser posterior a la de inicio.' }); }
        return errores;
    }

    function paquete() {
        var e = util.clonar(S.encuesta);
        for (var i = 0; i < e.Preguntas.length; i++) { e.Preguntas[i].Orden = i + 1; }
        e.Versiones = [];
        return e;
    }

    function bloquear(ocupado) {
        S.ocupado = ocupado;
        $('#cdBtnGuardar, #cdBtnPublicar').prop('disabled', ocupado);
    }

    function guardar() {
        if (S.ocupado) { return; }
        bloquear(true);
        CD.api.guardarBorrador(paquete())
            .done(function (e, msg) {
                asignarEncuesta(e, true);
                ui.toast(msg || 'Borrador guardado.', 'exito');
            })
            .fail(function (msg) { ui.toast(msg, 'error'); })
            .always(function () { bloquear(false); });
    }

    function publicar() {
        if (S.ocupado) { return; }
        var errores = validarParaPublicar();
        if (errores.length) {
            var lista = '<ul class="mb-0 ps-3">';
            for (var i = 0; i < errores.length && i < 8; i++) { lista += '<li>' + util.esc(errores[i].mensaje) + '</li>'; }
            lista += '</ul>';
            ui.confirmar({
                titulo: 'Antes de publicar corrige lo siguiente',
                mensajeHtml: lista,
                textoBoton: 'Ir a corregir',
                alAceptar: function () {
                    if (errores[0].tab) { mostrarTab(errores[0].tab); return; }
                    mostrarTab('constructor');
                    if (errores[0].clave) { seleccionar(errores[0].clave); }
                }
            });
            return;
        }
        var e = S.encuesta;
        var pub = e.Publicacion;
        var nuevaVersion = e.Estatus !== 'Borrador' && (e.TotalRespuestas > 0 || e.Estatus !== 'Publicada');
        ui.confirmar({
            titulo: 'Publicar encuesta',
            mensajeHtml: 'La encuesta estará disponible del <strong>' + util.fecha(pub.FechaInicio) + '</strong> al <strong>' + util.fecha(pub.FechaCierre) + '</strong>.' +
                (nuevaVersion ? '<br><br><i class="bi bi-clock-history me-1"></i>La versión actual tiene respuestas: se publicará una <strong>nueva versión</strong> y la anterior quedará en el histórico.' : ''),
            textoBoton: 'Publicar',
            alAceptar: function () {
                bloquear(true);
                CD.api.publicarEncuesta(paquete())
                    .done(function (enc, msg) {
                        asignarEncuesta(enc, true);
                        ui.toast(msg || 'Encuesta publicada.', 'exito');
                    })
                    .fail(function (msg) { ui.toast(msg, 'error'); })
                    .always(function () { bloquear(false); });
            }
        });
    }

    function cambiarEstatus(estatus, titulo, mensaje) {
        ui.confirmar({
            titulo: titulo,
            mensaje: mensaje + (S.sucio ? ' Los cambios sin guardar se perderán.' : ''),
            textoBoton: titulo,
            alAceptar: function () {
                CD.api.cambiarEstatus(S.id, estatus)
                    .done(function (e, msg) {
                        S.sucio = false;
                        cargar(null, true);
                        ui.toast(msg, 'exito');
                    })
                    .fail(function (msg) { ui.toast(msg, 'error'); });
            }
        });
    }

    function abrirVersion(idVersion) {
        var abrir = function () {
            ui.offcanvas('cdOffcanvasVersiones', 'hide');
            cargar(idVersion, false);
        };
        if (S.sucio) {
            ui.confirmar({ titulo: 'Cambios sin guardar', mensaje: 'Si abres otra versión se perderán los cambios sin guardar.', textoBoton: 'Abrir versión', alAceptar: abrir });
        } else {
            abrir();
        }
    }

    // ==================================================================
    //  EVENTOS
    // ==================================================================
    function enlazarEventos() {
        var $d = $(document);

        // ---------- Encabezado ----------
        $d.on('click', '.cd-tab[data-cd-tab]', function () { mostrarTab($(this).attr('data-cd-tab')); });
        $d.on('click', '#cdBtnVistaPrevia', function () { mostrarTab('preview'); });
        $d.on('click', '#cdBtnGuardar', guardar);
        $d.on('click', '#cdBtnPublicar', publicar);
        $d.on('click', '#cdBadgeVersion', function () { renderVersiones(); ui.offcanvas('cdOffcanvasVersiones', 'show'); });
        $d.on('click', '[data-cd-abrir-version]', function () { abrirVersion(parseInt($(this).attr('data-cd-abrir-version'), 10)); });

        $d.on('click', '#cdBtnEditarNombre', function () {
            $('#cdInputNombre').val(S.encuesta.Nombre);
            ui.modal('cdModalNombre', 'show');
            setTimeout(function () { $('#cdInputNombre').trigger('focus').trigger('select'); }, 300);
        });
        $d.on('click', '#cdBtnGuardarNombre', function () {
            var nombre = $.trim($('#cdInputNombre').val());
            if (!nombre) { ui.toast('El nombre es obligatorio.', 'error'); return; }
            S.encuesta.Nombre = nombre;
            marcarSucio();
            renderEncabezado();
            ui.modal('cdModalNombre', 'hide');
        });
        $d.on('keydown', '#cdInputNombre', function (e) { if (e.which === 13) { $('#cdBtnGuardarNombre').trigger('click'); } });

        $d.on('click', '[data-cd-accion]', function () {
            var accion = $(this).attr('data-cd-accion');
            if (accion === 'historial') { renderVersiones(); ui.offcanvas('cdOffcanvasVersiones', 'show'); }
            if (accion === 'captura') { window.open(CD.config.urls.captura + '/' + S.id, '_blank'); }
            if (accion === 'cerrar') { cambiarEstatus('Cerrada', 'Cerrar encuesta', 'Los usuarios ya no podrán responder.'); }
            if (accion === 'reabrir') { cambiarEstatus('Publicada', 'Reabrir encuesta', 'Los usuarios podrán volver a responder.'); }
            if (accion === 'archivar') { cambiarEstatus('Archivada', 'Archivar encuesta', 'La encuesta dejará de estar disponible y quedará como histórico.'); }
        });

        // ---------- Agregar pregunta ----------
        $d.on('click', '#cdBtnAgregarPregunta, [data-cd-abrir-tipos]', function () { ui.modal('cdModalTipos', 'show'); });
        $d.on('click', '[data-cd-agregar-tipo]', function () { agregarPregunta($(this).attr('data-cd-agregar-tipo')); });

        // ---------- Lista de preguntas ----------
        $d.on('click', '.cd-item-pregunta', function (e) {
            if ($(e.target).closest('.cd-menu').length) { return; }
            seleccionar($(this).attr('data-clave'));
        });
        $d.on('click', '[data-cd-item]', function (e) {
            e.stopPropagation();
            $('.cd-menu.abierto').removeClass('abierto');
            var clave = $(this).closest('.cd-item-pregunta').attr('data-clave');
            var accion = $(this).attr('data-cd-item');
            var idx = indiceDe(clave);
            var p = util.buscar(preguntas(), 'Clave', clave);
            if (accion === 'editar') { seleccionar(clave); }
            if (accion === 'duplicar') { duplicarPregunta(clave); }
            if (accion === 'subir') { moverPregunta(clave, idx - 1); }
            if (accion === 'bajar') { moverPregunta(clave, idx + 1); }
            if (accion === 'eliminar') { eliminarPregunta(clave); }
            if (accion === 'obligatoria') {
                if (p.EsLlave && p.Obligatoria) { ui.toast('El campo llave siempre es obligatorio.', 'info'); return; }
                p.Obligatoria = !p.Obligatoria;
                marcarSucio();
                refrescarTodoConstructor();
            }
        });

        // Botones del panel (subir, bajar, duplicar, eliminar)
        $d.on('click', '#cdBtnSubir', function () { if (S.sel) { moverPregunta(S.sel, indiceDe(S.sel) - 1); } });
        $d.on('click', '#cdBtnBajar', function () { if (S.sel) { moverPregunta(S.sel, indiceDe(S.sel) + 1); } });
        $d.on('click', '#cdBtnDuplicar', function () { if (S.sel) { duplicarPregunta(S.sel); } });
        $d.on('click', '#cdBtnEliminar', function () { if (S.sel) { eliminarPregunta(S.sel); } });

        // Arrastrar y soltar (HTML5 nativo)
        $d.on('dragstart', '.cd-item-pregunta', function (e) {
            S.dragClave = $(this).attr('data-clave');
            $(this).addClass('arrastrando');
            try { e.originalEvent.dataTransfer.setData('text', S.dragClave); } catch (ex) { /* IE */ }
            e.originalEvent.dataTransfer.effectAllowed = 'move';
        });
        $d.on('dragover', '.cd-item-pregunta', function (e) {
            if (!S.dragClave) { return; }
            e.preventDefault();
            var offset = $(this).offset().top;
            var mitad = offset + $(this).outerHeight() / 2;
            var arriba = e.originalEvent.pageY < mitad;
            $('.cd-item-pregunta').removeClass('destino-arriba destino-abajo');
            $(this).addClass(arriba ? 'destino-arriba' : 'destino-abajo');
        });
        $d.on('drop', '.cd-item-pregunta', function (e) {
            e.preventDefault();
            if (!S.dragClave) { return; }
            var destino = $(this).attr('data-clave');
            var abajo = $(this).hasClass('destino-abajo');
            var clave = S.dragClave;
            S.dragClave = null;
            if (destino === clave) { renderLista(); return; }
            var lista = preguntas();
            var p = lista.splice(indiceDe(clave), 1)[0];
            var idx = indiceDe(destino) + (abajo ? 1 : 0);
            lista.splice(idx, 0, p);
            marcarSucio();
            refrescarTodoConstructor();
        });
        $d.on('dragend', '.cd-item-pregunta', function () {
            S.dragClave = null;
            $('.cd-item-pregunta').removeClass('arrastrando destino-arriba destino-abajo');
        });

        // ---------- Panel: campos simples ----------
        $d.on('input change', '#cdPanelPregunta [data-campo]', function (e) {
            var p = actual();
            if (!p) { return; }
            var campo = $(this).attr('data-campo');
            var tipoValor = $(this).attr('data-valor') || 'texto';
            var valor;
            if (tipoValor === 'bool') { valor = this.checked; }
            else if (tipoValor === 'entero') { valor = util.entero(this.value); }
            else if (tipoValor === 'numero') { valor = util.numero(this.value); }
            else if (tipoValor === 'fecha') { valor = this.value || null; }
            else { valor = this.value; }
            var cambio = p[campo] !== valor;
            var repintar = $(this).attr('data-rerender') && e.type === 'change';
            if (!cambio && !repintar) { return; }   // 'input' y 'change' llegan juntos; se procesa una vez
            if (campo === 'EsLlave') {
                if (cambio) { asignarLlave(p, valor); }
            } else if (campo === 'Obligatoria' && !valor && p.EsLlave) {
                this.checked = true;
                ui.toast('El campo llave siempre es obligatorio.', 'info');
                return;
            } else {
                p[campo] = valor;
            }
            marcarSucio();
            if (repintar || campo === 'EsLlave') { renderPanel(); }
            renderLista();
            renderPreviewPregunta();
            if (campo === 'Texto') { renderLogica(); }
        });

        // Cambio de tipo
        $d.on('change', '#cdPanelTipo', function () {
            var p = actual();
            var anterior = p.Tipo;
            p.Tipo = this.value;
            aplicarDefaultsTipo(p, anterior);
            if (p.Reglas.length) {
                p.Reglas = [];
                ui.toast('Se reiniciaron las reglas de lógica porque cambió el tipo de pregunta.', 'info');
            }
            marcarSucio();
            refrescarTodoConstructor();
        });

        // Opciones / filas / columnas
        $d.on('input', '#cdPanelPregunta [data-lista]', function () {
            var p = actual();
            var lista = $(this).attr('data-lista');
            var idx = parseInt($(this).attr('data-idx'), 10);
            p[lista][idx].Texto = this.value;
            marcarSucio();
            renderPreviewPregunta();
            renderLogica();
        });

        $d.on('click', '#cdPanelPregunta [data-cd-op]', function (e) {
            e.preventDefault();
            var p = actual();
            if (!p) { return; }
            var op = $(this).attr('data-cd-op');
            var lista = $(this).attr('data-lista');
            var idx = parseInt($(this).attr('data-idx'), 10);
            var nivel = parseInt($(this).attr('data-nivel'), 10);
            var clave = $(this).attr('data-clave');
            var enfocar = null;

            switch (op) {
                case 'agregar-opcion':
                    var prefijos = { Opciones: 'Opción ', Filas: 'Fila ', Columnas: 'Columna ' };
                    p[lista].push({ Clave: util.clave('o'), Texto: prefijos[lista] + (p[lista].length + 1) });
                    enfocar = '[data-lista="' + lista + '"][data-idx="' + (p[lista].length - 1) + '"]';
                    break;
                case 'quitar-opcion':
                    var quitada = p[lista].splice(idx, 1)[0];
                    if (lista !== 'Filas') { quitarReglasPorValor(p, [quitada.Clave]); }
                    break;
                case 'texto-largo':
                    p.TextoLargo = $(this).attr('data-valor') === '1';
                    break;
                case 'escala':
                    p.EscalaMinimo = parseInt($(this).attr('data-min'), 10);
                    p.EscalaMaximo = parseInt($(this).attr('data-max'), 10);
                    break;
                case 'agregar-regla':
                    agregarRegla(p);
                    return;
                case 'quitar-regla':
                    p.Reglas.splice(idx, 1);
                    break;
                case 'agregar-nivel':
                    p.Niveles.push({ Nivel: p.Niveles.length + 1, Nombre: 'Nivel ' + (p.Niveles.length + 1), PermitirMultiple: false });
                    break;
                case 'quitar-nivel':
                    var ultimo = p.Niveles.pop();
                    var quitar = [];
                    var restantes = [];
                    for (var i = 0; i < p.OpcionesDependientes.length; i++) {
                        if (p.OpcionesDependientes[i].Nivel === ultimo.Nivel) { quitar.push(p.OpcionesDependientes[i].Clave); }
                        else { restantes.push(p.OpcionesDependientes[i]); }
                    }
                    p.OpcionesDependientes = restantes;
                    quitarReglasPorValor(p, quitar);
                    break;
                case 'dep-activar':
                    var ruta = rutaActiva(p).slice(0, nivel);
                    ruta[nivel] = clave;
                    S.depActivo[p.Clave] = ruta;
                    renderPanel();
                    return;
                case 'dep-agregar':
                    var padre = nivel === 0 ? null : rutaActiva(p)[nivel - 1];
                    var nueva = { Clave: util.clave('d'), Nivel: p.Niveles[nivel].Nivel, ClavePadre: padre, Texto: 'Nueva opción' };
                    p.OpcionesDependientes.push(nueva);
                    enfocar = '[data-dep-opcion="' + nueva.Clave + '"]';
                    break;
                case 'dep-quitar':
                    quitarReglasPorValor(p, quitarOpcionDependiente(p, clave));
                    break;
            }
            marcarSucio();
            renderPanel();
            renderLista();
            renderPreviewPregunta();
            renderLogica();
            if (enfocar) { $('#cdPanelPregunta ' + enfocar).trigger('focus').trigger('select'); }
        });

        // Dependiente: nombre de nivel, selección múltiple, texto de opción
        $d.on('input', '[data-dep-nivel-nombre]', function () {
            actual().Niveles[parseInt($(this).attr('data-dep-nivel-nombre'), 10)].Nombre = this.value;
            marcarSucio();
            renderPreviewPregunta();
        });
        $d.on('change', '[data-dep-nivel-multiple]', function () {
            actual().Niveles[parseInt($(this).attr('data-dep-nivel-multiple'), 10)].PermitirMultiple = this.checked;
            marcarSucio();
            renderPreviewPregunta();
        });
        $d.on('input', '[data-dep-opcion]', function () {
            var o = util.buscar(actual().OpcionesDependientes, 'Clave', $(this).attr('data-dep-opcion'));
            if (o) { o.Texto = this.value; }
            marcarSucio();
            renderPreviewPregunta();
        });

        // Reglas condicionales
        $d.on('input change', '#cdPanelPregunta [data-regla-campo]', function (e) {
            var p = actual();
            var r = p.Reglas[parseInt($(this).attr('data-regla'), 10)];
            var campo = $(this).attr('data-regla-campo');
            var valor = this.value || null;
            if (r[campo] === valor && e.type !== 'change') { return; }
            r[campo] = valor;
            if (campo === 'Accion' && r.Accion !== 'finalizar' && !r.ClaveDestino) {
                var siguiente = preguntas()[indiceDe(p.Clave) + 1];
                r.ClaveDestino = siguiente ? siguiente.Clave : null;
            }
            marcarSucio();
            if (e.type === 'change') { renderPanel(); }
            renderLista();
            renderLogica();
        });

        // Recordar acordeones abiertos
        $d.on('click', '#cdPanelPregunta .cd-acordeon-boton', function () {
            var $a = $(this).closest('.cd-acordeon');
            // el toggle lo hace cd.core.js; aquí solo se recuerda el estado
            setTimeout(function () { S.abiertos[$a.attr('data-cd-acordeon')] = $a.hasClass('abierto'); }, 0);
        });

        // Clic en el resumen de lógica -> abre la pregunta con su lógica
        $d.on('click', '[data-cd-ir-logica]', function () {
            S.abiertos.logica = true;
            S.sel = null;
            seleccionar($(this).attr('data-cd-ir-logica'));
        });

        // ---------- Configuración ----------
        $d.on('change input', '#cdCfgFechaInicio', function () { S.encuesta.Publicacion.FechaInicio = this.value || null; marcarSucio(); });
        $d.on('change input', '#cdCfgFechaCierre', function () { S.encuesta.Publicacion.FechaCierre = this.value || null; marcarSucio(); });
        $d.on('change', '#cdCfgAnonima', function () { S.encuesta.Publicacion.Anonima = this.checked; marcarSucio(); });
        $d.on('change', '#cdCfgAutenticado', function () {
            S.encuesta.Publicacion.RequiereAutenticacion = this.checked;
            if (!this.checked && S.encuesta.Publicacion.RespuestaUnica) {
                ui.toast('Sin usuario autenticado no se puede garantizar una respuesta por usuario.', 'info');
            }
            marcarSucio();
        });
        $d.on('input', '#cdCfgMensajeInicial', function () { S.encuesta.Publicacion.MensajeInicial = this.value; marcarSucio(); });
        $d.on('input', '#cdCfgMensajeFinal', function () { S.encuesta.Publicacion.MensajeFinal = this.value; marcarSucio(); });
        $d.on('input', '#cdCfgDescripcion', function () { S.encuesta.Descripcion = this.value; marcarSucio(); });
        $d.on('input', '#cdCfgPoblacion', function () { S.encuesta.PoblacionObjetivo = util.entero(this.value) || 0; marcarSucio(); });
        $d.on('click', '[data-cd-respuestas]', function () {
            S.encuesta.Publicacion.RespuestaUnica = $(this).attr('data-cd-respuestas') === '1';
            $('[data-cd-respuestas]').removeClass('activo');
            $(this).addClass('activo');
            marcarSucio();
        });

        // Segmentación
        $d.on('change', '#cdSegTipo', sugerenciasSegmento);
        $d.on('click', '#cdSegAgregar', function () {
            var valor = $.trim($('#cdSegValor').val());
            if (!valor) { ui.toast('Escribe el valor del segmento.', 'error'); return; }
            S.encuesta.Segmentacion.push({ Clave: util.clave('s'), Tipo: $('#cdSegTipo').val(), Valor: valor });
            $('#cdSegValor').val('');
            marcarSucio();
            renderSegmentacion();
        });
        $d.on('keydown', '#cdSegValor', function (e) { if (e.which === 13) { e.preventDefault(); $('#cdSegAgregar').trigger('click'); } });
        $d.on('click', '[data-cd-quitar-segmento]', function () {
            S.encuesta.Segmentacion.splice(parseInt($(this).attr('data-cd-quitar-segmento'), 10), 1);
            marcarSucio();
            renderSegmentacion();
        });

        // ---------- Vista previa ----------
        $d.on('click', '[data-cd-dispositivo]', function () {
            S.dispositivo = $(this).attr('data-cd-dispositivo');
            renderPreview();
        });
        $d.on('click', '#cdPreviewReiniciar', renderPreview);

        // ---------- Resultados ----------
        $d.on('change', '#cdResVersion', function () { CD.Resultados.cargar(S.id, util.entero(this.value)); });
        $d.on('click', '#cdResActualizar', function () { CD.Resultados.cargar(S.id, util.entero($('#cdResVersion').val())); });
    }

    // API pública del módulo
    CD.Editor = {
        init: init,
        estado: function () { return S; }
    };

})(window.CD);

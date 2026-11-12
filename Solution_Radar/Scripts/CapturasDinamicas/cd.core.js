/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Núcleo (cd.core.js)
   Utilerías, catálogos y componentes de interfaz compartidos.

   NOTA: Escrito en JavaScript básico (ES5) a propósito: sin funciones
   flecha, sin let/const, sin template strings, sin Promise, para que
   funcione en cualquier navegador del portal.

   Orden de carga de los scripts del módulo:
     cd.core.js -> cd.api.js -> cd.renderer.js -> (cd.listado.js | cd.editor.js + cd.resultados.js | cd.captura.js)
   ===================================================================== */

var CD = window.CD || {};
window.CD = CD;

(function (CD) {
    'use strict';

    // ------------------------------------------------------------------
    //  Configuración (las URLs las llena cada vista .cshtml con Url.Action)
    // ------------------------------------------------------------------
    CD.config = CD.config || { urls: {} };

    // ------------------------------------------------------------------
    //  CATÁLOGO DE TIPOS DE PREGUNTA
    //  Agregar un tipo nuevo = agregarlo aquí + en cd.renderer.js
    //  (render y lectura de respuesta) + en el panel de cd.editor.js.
    // ------------------------------------------------------------------
    CD.tipos = [
        { clave: 'unica', nombre: 'Opción única', icono: 'bi-ui-radios', desc: 'Una sola respuesta', usaOpciones: true, permiteOtro: true },
        { clave: 'multiple', nombre: 'Selección múltiple', icono: 'bi-ui-checks', desc: 'Varias respuestas', usaOpciones: true, permiteOtro: true },
        { clave: 'desplegable', nombre: 'Desplegable', icono: 'bi-menu-button-wide', desc: 'Lista de opciones', usaOpciones: true, permiteOtro: false },
        { clave: 'texto', nombre: 'Texto libre', icono: 'bi-input-cursor-text', desc: 'Respuesta abierta' },
        { clave: 'sino', nombre: 'Sí / No', icono: 'bi-toggle-on', desc: 'Respuesta binaria', usaOpciones: true, opcionesFijas: true },
        { clave: 'escala', nombre: 'Escala', icono: 'bi-sliders', desc: 'Valoración numérica (1 a 5, 1 a 10)' },
        { clave: 'matriz', nombre: 'Matriz', icono: 'bi-grid-3x3', desc: 'Filas evaluadas con la misma escala' },
        { clave: 'dependiente', nombre: 'Multiselección dependiente', icono: 'bi-diagram-3', desc: 'Listas encadenadas por niveles' },
        { clave: 'fecha', nombre: 'Fecha', icono: 'bi-calendar-event', desc: 'Selector de fecha' },
        { clave: 'numero', nombre: 'Número', icono: 'bi-123', desc: 'Solo valores numéricos' }
    ];

    CD.tipo = function (clave) {
        for (var i = 0; i < CD.tipos.length; i++) {
            if (CD.tipos[i].clave === clave) { return CD.tipos[i]; }
        }
        return CD.tipos[0];
    };

    CD.CLAVE_OTRO = '__otro';

    CD.acciones = [
        { clave: 'mostrar', nombre: 'Mostrar pregunta', icono: 'bi-eye' },
        { clave: 'ocultar', nombre: 'Ocultar pregunta', icono: 'bi-eye-slash' },
        { clave: 'irA', nombre: 'Ir a pregunta', icono: 'bi-arrow-return-right' },
        { clave: 'finalizar', nombre: 'Finalizar encuesta', icono: 'bi-flag' }
    ];

    CD.operadores = {
        igual: 'es',
        distinto: 'no es',
        contiene: 'incluye',
        mayor: 'es mayor que',
        menor: 'es menor que'
    };

    CD.segmentoTipos = [
        { clave: 'Puesto', nombre: 'Puesto', ejemplos: ['Ejecutivos', 'Gerentes', 'Subdirectores'] },
        { clave: 'Segmento', nombre: 'Segmento', ejemplos: ['Personal', 'Premier', 'PyME'] },
        { clave: 'Region', nombre: 'Región', ejemplos: ['Centro', 'Norte', 'Sur', 'Occidente'] },
        { clave: 'Sucursal', nombre: 'Sucursal', ejemplos: [] },
        { clave: 'Usuario', nombre: 'Usuario específico (núm. empleado)', ejemplos: [] }
    ];

    // ------------------------------------------------------------------
    //  UTILERÍAS
    // ------------------------------------------------------------------
    var util = {};

    /** Escapa texto para insertarlo en HTML (evita romper la pantalla o inyectar código). */
    util.esc = function (texto) {
        if (texto === null || texto === undefined) { return ''; }
        return String(texto)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /** Genera una clave única corta (para preguntas, opciones y reglas nuevas). */
    var contadorClave = 0;
    util.clave = function (prefijo) {
        contadorClave++;
        return (prefijo || 'k') + '_' + new Date().getTime().toString(36) + contadorClave.toString(36) +
            Math.floor(Math.random() * 1296).toString(36);
    };

    /** Copia profunda de objetos simples. */
    util.clonar = function (obj) {
        return JSON.parse(JSON.stringify(obj));
    };

    /** Busca el índice de un elemento por propiedad. */
    util.indice = function (lista, prop, valor) {
        if (!lista) { return -1; }
        for (var i = 0; i < lista.length; i++) {
            if (lista[i][prop] === valor) { return i; }
        }
        return -1;
    };

    util.buscar = function (lista, prop, valor) {
        var i = util.indice(lista, prop, valor);
        return i >= 0 ? lista[i] : null;
    };

    util.contiene = function (lista, valor) {
        if (!lista) { return false; }
        for (var i = 0; i < lista.length; i++) {
            if (lista[i] === valor) { return true; }
        }
        return false;
    };

    /** Convierte a entero; vacío o inválido = null. */
    util.entero = function (valor) {
        if (valor === null || valor === undefined || valor === '') { return null; }
        var n = parseInt(valor, 10);
        return isNaN(n) ? null : n;
    };

    util.numero = function (valor) {
        if (valor === null || valor === undefined || valor === '') { return null; }
        var n = parseFloat(String(valor).replace(',', '.'));
        return isNaN(n) ? null : n;
    };

    util.vacio = function (texto) {
        return texto === null || texto === undefined || String(texto).replace(/\s+/g, '') === '';
    };

    /** yyyy-MM-dd -> dd/MM/yyyy */
    util.fecha = function (iso) {
        if (!iso) { return ''; }
        var partes = String(iso).substring(0, 10).split('-');
        if (partes.length !== 3) { return iso; }
        return partes[2] + '/' + partes[1] + '/' + partes[0] + (String(iso).length > 10 ? String(iso).substring(10) : '');
    };

    /** Mezcla un arreglo (para "orden aleatorio"). Regresa una copia. */
    util.mezclar = function (lista) {
        var copia = lista.slice(0);
        for (var i = copia.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = copia[i];
            copia[i] = copia[j];
            copia[j] = tmp;
        }
        return copia;
    };

    CD.util = util;

    // ------------------------------------------------------------------
    //  USUARIO (objeto Token del portal)
    // ------------------------------------------------------------------
    /**
     * Regresa los datos del usuario tomados del objeto global "Token" del portal.
     * Si el Token no existe (por ejemplo en pruebas locales) regresa un usuario de ejemplo.
     */
    CD.usuario = function () {
        var t = window.Token;
        if (t && t.NumEmpleado) {
            return {
                NumEmpleado: String(t.NumEmpleado),
                NombreEmpleado: t.NombreEmpleado || '',
                Puesto: t.Puesto || '',
                Cencos: t.Cencos !== undefined && t.Cencos !== null ? String(t.Cencos) : '',
                CorreoNumEmpleado: t.CorreoNumEmpleado || '',
                Nivel: t.Nivel || ''
            };
        }
        return { NumEmpleado: '00000000', NombreEmpleado: 'Usuario de prueba', Puesto: '', Cencos: '', CorreoNumEmpleado: '', Nivel: '' };
    };

    // ------------------------------------------------------------------
    //  COMPONENTES DE INTERFAZ (sin depender de data-bs-toggle)
    // ------------------------------------------------------------------
    var ui = {};

    /** Notificación flotante. tipo: 'exito' | 'error' | 'info' */
    ui.toast = function (mensaje, tipo) {
        var $cont = jQuery('.cd-toasts');
        if ($cont.length === 0) {
            $cont = jQuery('<div class="cd-toasts"></div>').appendTo('body');
        }
        var icono = tipo === 'error' ? 'bi-exclamation-circle' : (tipo === 'exito' ? 'bi-check-circle-fill' : 'bi-info-circle');
        var $t = jQuery('<div class="cd-toast ' + (tipo || 'info') + '"><i class="bi ' + icono + '"></i><div>' +
            util.esc(mensaje) + '</div></div>');
        $cont.append($t);
        setTimeout(function () {
            $t.fadeOut(300, function () { $t.remove(); });
        }, tipo === 'error' ? 6000 : 4000);
    };

    /** Abre/cierra un modal de Bootstrap por id usando la API JS (no data-attributes). */
    ui.modal = function (id, accion) {
        var el = document.getElementById(id);
        if (!el) { return; }
        if (window.bootstrap && window.bootstrap.Modal) {
            var inst = window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
            if (accion === 'hide') { inst.hide(); } else { inst.show(); }
        } else {
            // Respaldo si no cargó el JS de Bootstrap
            if (accion === 'hide') { jQuery(el).removeClass('show').hide(); } else { jQuery(el).addClass('show').show(); }
        }
    };

    ui.offcanvas = function (id, accion) {
        var el = document.getElementById(id);
        if (!el) { return; }
        if (window.bootstrap && window.bootstrap.Offcanvas) {
            var inst = window.bootstrap.Offcanvas.getInstance(el) || new window.bootstrap.Offcanvas(el);
            if (accion === 'hide') { inst.hide(); } else { inst.show(); }
        } else {
            if (accion === 'hide') { jQuery(el).removeClass('show').hide(); } else { jQuery(el).addClass('show').css('visibility', 'visible').show(); }
        }
    };

    /**
     * Confirmación con modal (#cdModalConfirmar). Si no existe usa window.confirm.
     * opciones: { titulo, mensaje, textoBoton, peligro, alAceptar }
     */
    ui.confirmar = function (opciones) {
        var $m = jQuery('#cdModalConfirmar');
        if ($m.length === 0) {
            if (window.confirm(opciones.mensaje)) { opciones.alAceptar(); }
            return;
        }
        $m.find('.cd-confirmar-titulo').text(opciones.titulo || 'Confirmar');
        $m.find('.cd-confirmar-mensaje').html(opciones.mensajeHtml || util.esc(opciones.mensaje));
        var $btn = $m.find('.cd-confirmar-aceptar');
        $btn.text(opciones.textoBoton || 'Aceptar');
        $btn.off('click').on('click', function () {
            ui.modal('cdModalConfirmar', 'hide');
            opciones.alAceptar();
        });
        ui.modal('cdModalConfirmar', 'show');
    };

    /** Muestra un indicador de carga dentro de un contenedor. */
    ui.cargando = function ($cont, texto) {
        $cont.html('<div class="cd-cargando"><div class="spinner-border spinner-border-sm me-2"></div>' +
            util.esc(texto || 'Cargando...') + '</div>');
    };

    /** Badge de estatus. */
    ui.badgeEstatus = function (estatus) {
        var icono = { Publicada: 'bi-broadcast', Borrador: 'bi-pencil', Cerrada: 'bi-lock', Archivada: 'bi-archive' }[estatus] || 'bi-circle';
        return '<span class="cd-badge cd-badge-' + util.esc(estatus) + '"><i class="bi ' + icono + ' me-1"></i>' + util.esc(estatus) + '</span>';
    };

    CD.ui = ui;

    // ------------------------------------------------------------------
    //  COMPORTAMIENTOS GLOBALES (delegados en document)
    //  Usan el namespace ".cdGlobal" y se quitan antes de registrarse:
    //  si la vista parcial se carga varias veces por AJAX (y este archivo
    //  se vuelve a ejecutar), los eventos NO se duplican.
    // ------------------------------------------------------------------
    jQuery(function () {
        var $doc = jQuery(document);
        $doc.off('.cdGlobal');

        // Menús desplegables propios: <div class="cd-menu"><button data-cd-menu>...</button><div class="cd-menu-lista">...</div></div>
        $doc.on('click.cdGlobal', '[data-cd-menu]', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var $menu = jQuery(this).closest('.cd-menu');
            var abierto = $menu.hasClass('abierto');
            jQuery('.cd-menu.abierto').removeClass('abierto');
            if (!abierto) { $menu.addClass('abierto'); }
        });
        $doc.on('click.cdGlobal', function () {
            jQuery('.cd-menu.abierto').removeClass('abierto');
        });

        // Acordeones propios: <div class="cd-acordeon"><button class="cd-acordeon-boton">...</button><div class="cd-acordeon-cuerpo">
        $doc.on('click.cdGlobal', '.cd-acordeon-boton', function (e) {
            e.preventDefault();
            jQuery(this).closest('.cd-acordeon').toggleClass('abierto');
        });

        // Botones que cierran modales / offcanvas sin data-bs-dismiss
        $doc.on('click.cdGlobal', '[data-cd-cerrar-modal]', function (e) {
            e.preventDefault();
            ui.modal(jQuery(this).closest('.modal').attr('id'), 'hide');
        });
        $doc.on('click.cdGlobal', '[data-cd-cerrar-offcanvas]', function (e) {
            e.preventDefault();
            ui.offcanvas(jQuery(this).closest('.offcanvas').attr('id'), 'hide');
        });
    });

})(CD);

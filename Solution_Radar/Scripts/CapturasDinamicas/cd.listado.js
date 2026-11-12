/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Listado de encuestas (cd.listado.js)
   Controla la vista Administrador.cshtml (parcial _ListadoEncuestas).
   ===================================================================== */

(function (CD) {
    'use strict';

    var util = CD.util;
    var ui = CD.ui;
    var $ = jQuery;
    var encuestas = [];
    var filtro = { texto: '', estatus: '' };

    function init() {
        enlazarEventos();
        cargar();
    }

    function cargar() {
        ui.cargando($('#cdTablaEncuestas'), 'Cargando encuestas...');
        CD.api.listarEncuestas()
            .done(function (lista) {
                encuestas = lista || [];
                render();
            })
            .fail(function (msg) {
                $('#cdTablaEncuestas').html('<div class="p-3 text-cd-red">' + util.esc(msg) + '</div>');
            });
    }

    function urlEditor(id, hash) {
        return CD.config.urls.editor + '/' + id + (hash ? '#' + hash : '');
    }

    /** Atributos de un enlace al editor (href normal + datos para abrirlo por AJAX). */
    function enlaceEditor(id, pestana) {
        return 'href="' + urlEditor(id, pestana) + '" data-cd-abrir-editor="' + id + '"' +
            (pestana ? ' data-cd-pestana="' + pestana + '"' : '');
    }

    /**
     * Abre el constructor. Si el portal definió CD.config.abrirEditor(id, pestana)
     * (por ejemplo, para cargar /CapturasDinamicas/EditorParcial por AJAX) se usa esa
     * función; si no, se navega a la página /CapturasDinamicas/Editor/{id}.
     */
    function abrirEditor(id, pestana) {
        if (typeof CD.config.abrirEditor === 'function') {
            CD.config.abrirEditor(id, pestana || null);
        } else {
            window.location.href = urlEditor(id, pestana);
        }
    }

    function render() {
        var filas = '';
        var visibles = 0;
        var conteo = { '': encuestas.length, Borrador: 0, Publicada: 0, Cerrada: 0, Archivada: 0 };

        for (var i = 0; i < encuestas.length; i++) {
            var e = encuestas[i];
            conteo[e.Estatus] = (conteo[e.Estatus] || 0) + 1;
            if (filtro.estatus && e.Estatus !== filtro.estatus) { continue; }
            if (filtro.texto && e.Nombre.toLowerCase().indexOf(filtro.texto) < 0) { continue; }
            visibles++;

            var version = 'v' + e.NumeroVersionVigente;
            if (e.NumeroVersionUltima !== e.NumeroVersionVigente) {
                version += ' <span class="cd-badge cd-badge-Borrador ms-1">v' + e.NumeroVersionUltima + ' ' + e.EstatusUltimaVersion.toLowerCase() + '</span>';
            }

            filas += '<tr>' +
                '<td><a class="cd-nombre" ' + enlaceEditor(e.IdEncuesta) + '>' + util.esc(e.Nombre) + '</a>' +
                (e.Descripcion ? '<div class="small text-cd-muted">' + util.esc(e.Descripcion) + '</div>' : '') + '</td>' +
                '<td>' + ui.badgeEstatus(e.Estatus) + '</td>' +
                '<td class="text-nowrap">' + version + '</td>' +
                '<td class="text-center">' + e.TotalPreguntas + '</td>' +
                '<td class="text-center">' + e.TotalRespuestas + '</td>' +
                '<td class="small text-nowrap">' + (e.FechaInicio ? util.fecha(e.FechaInicio) + ' – ' + util.fecha(e.FechaCierre) : '—') + '</td>' +
                '<td class="small text-cd-muted">' + util.fecha(e.FechaModificacion) + '<br>' + util.esc(e.UsuarioModifica) + '</td>' +
                '<td class="text-end text-nowrap">' +
                '<a class="btn btn-sm btn-cd-borde me-1" ' + enlaceEditor(e.IdEncuesta) + ' title="Editar"><i class="bi bi-pencil"></i></a>' +
                '<a class="btn btn-sm btn-cd-borde me-1" ' + enlaceEditor(e.IdEncuesta, 'resultados') + ' title="Resultados"><i class="bi bi-bar-chart"></i></a>' +
                (e.Estatus === 'Publicada' ? '<a class="btn btn-sm btn-cd-borde" href="' + CD.config.urls.captura + '/' + e.IdEncuesta + '" target="_blank" title="Abrir captura"><i class="bi bi-box-arrow-up-right"></i></a>' : '') +
                '</td></tr>';
        }

        $('[data-cd-filtro]').each(function () {
            var est = $(this).attr('data-cd-filtro');
            $(this).toggleClass('activo', est === filtro.estatus);
            $(this).find('.cd-contador').text(conteo[est] || 0);
        });

        if (!visibles) {
            $('#cdTablaEncuestas').html('<div class="cd-vacio"><i class="bi bi-inbox"></i>No hay encuestas que coincidan.</div>');
            return;
        }

        $('#cdTablaEncuestas').html('<div class="table-responsive"><table class="table cd-tabla-encuestas align-middle">' +
            '<thead><tr><th>Encuesta</th><th>Estatus</th><th>Versión</th><th class="text-center">Preguntas</th><th class="text-center">Respuestas</th>' +
            '<th>Vigencia</th><th>Última modificación</th><th></th></tr></thead><tbody>' + filas + '</tbody></table></div>');
    }

    function crear() {
        var nombre = $.trim($('#cdNuevaNombre').val());
        if (!nombre) { ui.toast('Escribe el nombre de la encuesta.', 'error'); return; }
        $('#cdBtnCrearEncuesta').prop('disabled', true);
        CD.api.crearEncuesta(nombre, $.trim($('#cdNuevaDescripcion').val()))
            .done(function (e) {
                ui.modal('cdModalNuevaEncuesta', 'hide');
                // Espera a que termine la animación del modal antes de reemplazar el contenido
                setTimeout(function () {
                    $('.modal-backdrop').remove();
                    $('body').removeClass('modal-open').css({ overflow: '', paddingRight: '' });
                    abrirEditor(e.IdEncuesta);
                }, 400);
            })
            .fail(function (msg) { ui.toast(msg, 'error'); })
            .always(function () { $('#cdBtnCrearEncuesta').prop('disabled', false); });
    }

    /**
     * Eventos con namespace ".cdListado": se quitan antes de registrarse para que,
     * si la parcial _ListadoEncuestas se carga varias veces por AJAX, no se dupliquen
     * (por ejemplo, que "Crear" no cree dos encuestas).
     */
    function enlazarEventos() {
        var $d = $(document);
        $d.off('.cdListado');
        $d.on('input.cdListado', '#cdBuscarEncuesta', function () {
            filtro.texto = this.value.toLowerCase();
            render();
        });
        $d.on('click.cdListado', '[data-cd-filtro]', function () {
            filtro.estatus = $(this).attr('data-cd-filtro');
            render();
        });
        $d.on('click.cdListado', '#cdBtnNuevaEncuesta', function () {
            $('#cdNuevaNombre, #cdNuevaDescripcion').val('');
            ui.modal('cdModalNuevaEncuesta', 'show');
            setTimeout(function () { $('#cdNuevaNombre').trigger('focus'); }, 300);
        });
        $d.on('click.cdListado', '#cdBtnCrearEncuesta', crear);
        // Abrir el editor: por AJAX si el portal definió CD.config.abrirEditor; si no, enlace normal
        $d.on('click.cdListado', '[data-cd-abrir-editor]', function (e) {
            if (typeof CD.config.abrirEditor !== 'function') { return; }   // deja que el enlace navegue
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.which === 2) { return; }   // abrir en otra pestaña
            e.preventDefault();
            abrirEditor(parseInt($(this).attr('data-cd-abrir-editor'), 10), $(this).attr('data-cd-pestana'));
        });
        $d.on('keydown.cdListado', '#cdNuevaNombre', function (e) { if (e.which === 13) { crear(); } });
    }

    CD.Listado = { init: init, recargar: cargar };

})(window.CD);

/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Pantalla de captura (cd.captura.js)
   Controla Captura.cshtml (parcial _CapturaFormulario): el usuario
   final responde la versión PUBLICADA de la encuesta.
   ===================================================================== */

(function (CD) {
    'use strict';

    var util = CD.util;
    var $ = jQuery;

    function init(cfg) {
        var $c = $('#cdCapturaContenido');
        CD.ui.cargando($c, 'Cargando encuesta...');

        CD.api.obtenerCaptura(cfg.idEncuesta)
            .done(function (info) {
                if (!info.PuedeResponder) {
                    mensaje($c, 'bi-info-circle', info.Mensaje);
                    return;
                }
                var encuesta = info.Encuesta;
                document.title = encuesta.Nombre;

                var renderer = new CD.Renderer($c, encuesta, {
                    modo: 'captura',
                    dispositivo: $(window).width() < 576 ? 'movil' : 'desktop',
                    prefijo: 'cap',
                    alEnviar: function (respuestas, r) {
                        r.setEnviando(true);
                        CD.api.guardarRespuesta({
                            IdEncuesta: encuesta.IdEncuesta,
                            IdVersion: encuesta.IdVersion,
                            Respuestas: respuestas
                        }).done(function (idRespuesta, mensajeFinal) {
                            r.mostrarFinal(mensajeFinal || (encuesta.Publicacion || {}).MensajeFinal);
                        }).fail(function (msg) {
                            r.setEnviando(false);
                            CD.ui.toast(msg, 'error');
                        });
                    }
                });
                renderer.render();
            })
            .fail(function (msg) {
                mensaje($c, 'bi-exclamation-triangle', msg);
            });
    }

    function mensaje($c, icono, texto) {
        $c.html('<div class="cd-form-final"><i class="bi ' + icono + '" style="color:#6b6f76"></i><h5 class="mt-3">' + util.esc(texto) + '</h5></div>');
    }

    CD.Captura = { init: init };

})(window.CD);

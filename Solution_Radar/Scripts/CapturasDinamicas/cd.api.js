/* =====================================================================
   MÓDULO CAPTURA DINÁMICA - Acceso al servidor (cd.api.js)

   ÚNICO lugar donde el JavaScript habla con el backend.
   Todas las funciones regresan un objeto jQuery Deferred:

       CD.api.listarEncuestas()
           .done(function (datos) { ... })     // datos = respuesta.Datos
           .fail(function (mensaje) { ... });  // mensaje de error en texto

   El servidor siempre responde { Exito, Mensaje, Datos }.
   Las URLs se configuran en cada vista (CD.config.urls) con Url.Action,
   así funcionan aunque el sitio esté en un directorio virtual.
   ===================================================================== */

(function (CD) {
    'use strict';

    /** Llamada genérica. metodo: 'GET' | 'POST' */
    function llamar(nombreUrl, metodo, parametros) {
        var def = jQuery.Deferred();
        var url = CD.config.urls[nombreUrl];

        if (!url) {
            def.reject('No está configurada la URL "' + nombreUrl + '".');
            return def.promise();
        }

        jQuery.ajax({
            url: url,
            type: metodo,
            data: parametros || {},
            dataType: 'json',
            cache: false              // evita que IE guarde en caché las respuestas GET
        }).done(function (resp) {
            if (resp && resp.Exito) {
                def.resolve(resp.Datos, resp.Mensaje);
            } else {
                def.reject(resp && resp.Mensaje ? resp.Mensaje : 'No fue posible completar la operación.');
            }
        }).fail(function (xhr) {
            def.reject('Error de comunicación con el servidor (' + (xhr && xhr.status ? xhr.status : 'sin respuesta') + ').');
        });

        return def.promise();
    }

    /** Parámetros comunes para POST: datos en JSON + usuario del Token. */
    function paqueteUsuario(extra) {
        var p = extra || {};
        p.usuario = JSON.stringify(CD.usuario());
        return p;
    }

    CD.api = {
        // ---------- Administrador ----------
        listarEncuestas: function () {
            return llamar('listarEncuestas', 'GET');
        },

        obtenerEncuesta: function (idEncuesta, idVersion) {
            var p = { id: idEncuesta };
            if (idVersion) { p.idVersion = idVersion; }
            return llamar('obtenerEncuesta', 'GET', p);
        },

        crearEncuesta: function (nombre, descripcion) {
            return llamar('crearEncuesta', 'POST',
                paqueteUsuario({ datos: JSON.stringify({ Nombre: nombre, Descripcion: descripcion }) }));
        },

        guardarBorrador: function (encuesta) {
            return llamar('guardarBorrador', 'POST', paqueteUsuario({ datos: JSON.stringify(encuesta) }));
        },

        publicarEncuesta: function (encuesta) {
            return llamar('publicarEncuesta', 'POST', paqueteUsuario({ datos: JSON.stringify(encuesta) }));
        },

        cambiarEstatus: function (idEncuesta, estatus) {
            return llamar('cambiarEstatus', 'POST', paqueteUsuario({ id: idEncuesta, estatus: estatus }));
        },

        obtenerResultados: function (idEncuesta, idVersion) {
            var p = { id: idEncuesta };
            if (idVersion) { p.idVersion = idVersion; }
            return llamar('obtenerResultados', 'GET', p);
        },

        // ---------- Captura (usuario final) ----------
        obtenerCaptura: function (idEncuesta) {
            return llamar('obtenerCaptura', 'POST', paqueteUsuario({ id: idEncuesta }));
        },

        guardarRespuesta: function (respuesta) {
            return llamar('guardarRespuesta', 'POST', paqueteUsuario({ datos: JSON.stringify(respuesta) }));
        }
    };

})(window.CD);

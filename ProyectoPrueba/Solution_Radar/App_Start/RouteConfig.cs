using System.Web.Mvc;
using System.Web.Routing;

namespace Solution_Radar
{
    public class RouteConfig
    {
        public static void RegisterRoutes(RouteCollection routes)
        {
            routes.IgnoreRoute("{resource}.axd/{*pathInfo}");

            // La página de inicio del proyecto de prueba abre el administrador del módulo
            routes.MapRoute(
                name: "Default",
                url: "{controller}/{action}/{id}",
                defaults: new { controller = "CapturasDinamicas", action = "Administrador", id = UrlParameter.Optional }
            );
        }
    }
}

/**
 * INSIGHTS GENERATOR (V3)
 * ✅ V1 SAFE
 * - Sin workflows
 * - Limited visibility SOLO por error real
 * - UX limpia y honesta
 */
export function generateInsights({
  efficiency,
  contacts,
  users
}) {
  const insights = [];

  /* --------------------------------------------------
     🔒 LIMITED VISIBILITY (GLOBAL)
     SOLO si hubo error real de permisos / API
  -------------------------------------------------- */
  if (efficiency.hasLimitedVisibility) {
    insights.push({
      id: "limited-visibility",
      severity: "warning",
      title: "Visibilidad limitada de datos detectada",
      description:
        "Algunos datos de HubSpot no pudieron ser analizados debido a permisos faltantes o restricciones de la API.",
      recommendation:
        "Revisa los permisos de la aplicación y asegúrate de que se haya otorgado el acceso requerido.",
      relatedModule: "global"
    });
  }

  /* --------------------------------------------------
     CONTACTS
  -------------------------------------------------- */
  if (contacts.withoutEmail > 0) {
    insights.push({
      id: "contacts-without-email",
      severity: "warning",
      title: "Contactos sin correo electrónico",
      description:
        `${contacts.withoutEmail} contactos no tienen un correo electrónico, limitando la capacidad de interacción y automatización.`,
      recommendation:
        "Enriquece los datos de tus contactos o obliga a capturar el correo electrónico en todas las fuentes de leads.",
      relatedModule: "contacts"
    });
  }

  if (contacts.withoutLifecycle > 0) {
    insights.push({
      id: "contacts-without-lifecycle",
      severity: "warning",
      title: "Contacts missing lifecycle stage",
      description:
        `${contacts.withoutLifecycle} contactos no tienen una etapa de ciclo de vida, lo que impacta en el reporte y visibilidad de la canalización.`,
      recommendation:
        "Asigna etapas de ciclo de vida automáticamente usando los valores por defecto de los formularios o las reglas de la CRM.",
      relatedModule: "contacts"
    });
  }

  if (contacts.stale > 0) {
    insights.push({
      id: "stale-contacts",
      severity: "critical",
      title: "Contactos obsoletos detectados",
      description:
        `${contacts.stale} contactos no han sido actualizados en mucho tiempo, aumentando el clutter de la CRM y los costos.`,
      recommendation:
        "Ejecuta un proceso de limpieza o archiva los contactos obsoletos periódicamente.",
      relatedModule: "contacts"
    });
  }

  /* --------------------------------------------------
     USERS
  -------------------------------------------------- */
  if (users.inactive > 0) {
    insights.push({
      id: "inactive-users",
      severity: "critical",
      title: "Usuarios inactivos de HubSpot detectados",
      description:
        `${users.inactive} usuarios aparecen inactivos pero todavía ocupan asientos pagos.`,
      recommendation:
        "Elimina o reduce el nivel de los usuarios inactivos para reducir los costos de suscripción.",
      relatedModule: "users"
    });
  }

  /* --------------------------------------------------
     POSITIVE INSIGHT (NO ISSUES)
  -------------------------------------------------- */
  if (insights.length === 0) {
    insights.push({
      id: "healthy-account",
      severity: "info",
      title: "Cuenta de HubSpot saludable",
      description:
        "No se detectaron ineficiencias significativas. Tu cuenta está bien estructurada y optimizada.",
      recommendation:
        "Mantén la actual gobernanza y revisa periódicamente a medida que crece tu base de datos.",
      relatedModule: "global"
    });
  }

  return insights;
}

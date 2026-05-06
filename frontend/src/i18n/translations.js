// =============================================================================
// LIONSBIT i18n — minimalist dictionary-based translations.
// =============================================================================
// Strategy: NO heavy library (no react-i18next). Just a flat dictionary keyed
// by canonical Spanish strings, looked up via a `t()` function provided by
// LanguageContext. Strings without a translation fall back to the canonical
// Spanish string so the app never shows blank labels.
//
// Coverage policy: high-visibility surfaces only (sidebar nav, community
// directory, dashboards, login). Long-form copy stays in Spanish — adding it
// to this file is a 5-minute task whenever a new string deserves localisation.
// =============================================================================

export const SUPPORTED_LANGUAGES = [
    { code: 'es', label: 'Español',  flag: '🇪🇸' },
    { code: 'en', label: 'English',  flag: '🇬🇧' },
    { code: 'fr', label: 'Français', flag: '🇫🇷' },
];

export const DEFAULT_LANG = 'es';

// =============================================================================
// Dictionary
// =============================================================================
//   • Keys are the canonical Spanish phrases (kept readable for greppability).
//   • Values map to their EN / FR counterparts.
//   • Strings not found here render their Spanish key verbatim.
// =============================================================================
export const TRANSLATIONS = {
    // ── Sidebar / Navigation ────────────────────────────────────────────────
    'Banca':                      { en: 'Banking',         fr: 'Banque' },
    'Dashboard':                  { en: 'Dashboard',       fr: 'Tableau de bord' },
    'Trading Demo':               { en: 'Trading Demo',    fr: 'Démo de Trading' },
    'Trading Bot':                { en: 'Trading Bot',     fr: 'Robot de Trading' },
    'MT5 Profesional':            { en: 'MT5 Pro',         fr: 'MT5 Pro' },
    'InvestingPro':               { en: 'InvestingPro',    fr: 'InvestingPro' },
    'Asesores y Analistas':       { en: 'Advisors & Analysts', fr: 'Conseillers & Analystes' },
    'Comunidad':                  { en: 'Community',       fr: 'Communauté' },
    'Accounts':                   { en: 'Accounts',        fr: 'Comptes' },
    'Transactions':               { en: 'Transactions',    fr: 'Transactions' },
    'Transferencia Bancaria':     { en: 'Bank Transfer',   fr: 'Virement bancaire' },
    'Bitcoin Outputs':            { en: 'Bitcoin Outputs', fr: 'Sorties Bitcoin' },
    'Transfer':                   { en: 'Transfer',        fr: 'Transfert' },
    'Withdraw':                   { en: 'Withdraw',        fr: 'Retrait' },
    'Metodos de Retiro':          { en: 'Withdrawal Methods', fr: 'Méthodes de retrait' },
    'Wallet / Activos':           { en: 'Wallet / Assets', fr: 'Portefeuille / Actifs' },
    'Logros':                     { en: 'Achievements',    fr: 'Réalisations' },
    'Verification':               { en: 'Verification',    fr: 'Vérification' },
    'Support':                    { en: 'Support',         fr: 'Support' },
    'Settings':                   { en: 'Settings',        fr: 'Paramètres' },
    'Análisis Financiero':        { en: 'Financial Analysis', fr: 'Analyse financière' },
    'Mercado en Vivo':            { en: 'Live Market',     fr: 'Marché en direct' },
    'Cerrar Sesión':              { en: 'Sign Out',        fr: 'Déconnexion' },
    'Idioma':                     { en: 'Language',        fr: 'Langue' },
    'Conectando…':                { en: 'Connecting…',     fr: 'Connexion…' },
    'Conectado':                  { en: 'Online',          fr: 'En ligne' },
    'Modo demo':                  { en: 'Demo mode',       fr: 'Mode démo' },
    'Conexión restablecida':      { en: 'Connection restored', fr: 'Connexion rétablie' },
    'Modo demo activado':         { en: 'Demo mode active',  fr: 'Mode démo activé' },
    'Mostrando datos de ejemplo. El servidor no responde, reintentando cada 30 s.': {
        en: 'Showing sample data. Server is not responding, retrying every 30s.',
        fr: 'Affichage de données d\'exemple. Le serveur ne répond pas, nouvelle tentative toutes les 30 s.',
    },
    'Reintentar ahora':           { en: 'Retry now',         fr: 'Réessayer maintenant' },

    // ── Community / Directory ────────────────────────────────────────────────
    'Lionsbit · Directorio Institucional': {
        en: 'Lionsbit · Institutional Directory',
        fr: 'Lionsbit · Annuaire institutionnel',
    },
    'Directorio de Miembros Verificados': {
        en: 'Verified Members Directory',
        fr: 'Annuaire des membres vérifiés',
    },
    'Registro público de cuentas verificadas. Consulta el estado de verificación, depósitos y retiros procesados. Información estructurada bajo lineamientos GDPR.': {
        en: 'Public registry of verified accounts. Check verification status, deposits, and processed withdrawals. Information structured under GDPR guidelines.',
        fr: 'Registre public des comptes vérifiés. Consultez le statut de vérification, les dépôts et les retraits traités. Informations structurées selon le RGPD.',
    },
    'Sistema activo':             { en: 'System active',     fr: 'Système actif' },
    'Total Retirado':             { en: 'Total Withdrawn',   fr: 'Total retiré' },
    'Total Pagado':               { en: 'Total Paid',        fr: 'Total payé' },
    'retiros completados':        { en: 'completed withdrawals', fr: 'retraits effectués' },
    'Cuentas registradas':        { en: 'Registered accounts', fr: 'Comptes enregistrés' },
    'activas en la red':          { en: 'active in the network', fr: 'actifs dans le réseau' },
    'En revisión':                { en: 'Under review',      fr: 'En cours de révision' },
    'pendientes':                 { en: 'pending',           fr: 'en attente' },
    'País principal':             { en: 'Top country',       fr: 'Pays principal' },
    'cuentas':                    { en: 'accounts',          fr: 'comptes' },
    'Buscar por nombre, país o estado...': {
        en: 'Search by name, country or status…',
        fr: 'Rechercher par nom, pays ou statut…',
    },
    'Todos':                      { en: 'All',               fr: 'Tous' },
    'Activo':                     { en: 'Active',            fr: 'Actif' },
    'Retiro pendiente':           { en: 'Pending withdrawal',fr: 'Retrait en attente' },
    'Retirado':                   { en: 'Withdrawn',         fr: 'Retiré' },
    'Mostrando':                  { en: 'Showing',           fr: 'Affichage' },
    'resultados':                 { en: 'results',           fr: 'résultats' },
    'miembros':                   { en: 'members',           fr: 'membres' },
    'use la búsqueda para una consulta específica': {
        en: 'use search for a specific query',
        fr: 'utilisez la recherche pour une requête spécifique',
    },
    'consulta global':            { en: 'global query',      fr: 'requête globale' },
    'No se encontraron miembros con esos filtros.': {
        en: 'No members match those filters.',
        fr: 'Aucun membre ne correspond à ces filtres.',
    },
    'Cargar más':                 { en: 'Load more',         fr: 'Charger plus' },
    'restantes':                  { en: 'remaining',         fr: 'restants' },
    'La información mostrada es pública y no incluye correos, teléfonos ni documentos personales. Estructurado bajo lineamientos GDPR.': {
        en: 'The information shown is public and does not include emails, phone numbers, or personal documents. Structured under GDPR guidelines.',
        fr: 'Les informations affichées sont publiques et n\'incluent ni e-mails, ni téléphones, ni documents personnels. Structuré selon le RGPD.',
    },

    // Hall of Fame & Live feed
    'Hall of Fame · 30d':         { en: 'Hall of Fame · 30d', fr: 'Hall of Fame · 30j' },
    'Top retiros del mes':        { en: 'Top withdrawals of the month', fr: 'Meilleurs retraits du mois' },
    'Libro de transacciones':     { en: 'Transaction ledger', fr: 'Journal des transactions' },
    'Retiros verificados':        { en: 'Verified withdrawals', fr: 'Retraits vérifiés' },
    'Live · 12s':                 { en: 'Live · 12s',        fr: 'Direct · 12s' },
    'En pausa':                   { en: 'Paused',            fr: 'En pause' },

    // Cards / status labels
    'Verificación':               { en: 'Verification',      fr: 'Vérification' },
    'Impuesto':                   { en: 'Tax',               fr: 'Impôt' },
    'Revisión':                   { en: 'Review',            fr: 'Revue' },
    'Transferencia':              { en: 'Transfer',          fr: 'Transfert' },
    'En proceso':                 { en: 'In progress',       fr: 'En cours' },
    'Proceso completado':         { en: 'Process completed', fr: 'Processus terminé' },
    'Recorrido del proceso':      { en: 'Process timeline',  fr: 'Parcours du processus' },
    'ID Cuenta':                  { en: 'Account ID',        fr: 'ID du compte' },
    'Depositado':                 { en: 'Deposited',         fr: 'Déposé' },
    'Disponible':                 { en: 'Available',         fr: 'Disponible' },
    'Verificado':                 { en: 'Verified',          fr: 'Vérifié' },
    'Capital recuperado':         { en: 'Capital recovered', fr: 'Capital récupéré' },
    'Retiro Procesado':           { en: 'Withdrawal Processed', fr: 'Retrait traité' },
    'Premium':                    { en: 'Premium',           fr: 'Premium' },
    'Prioritario':                { en: 'Priority',          fr: 'Prioritaire' },
    'Tú':                         { en: 'You',               fr: 'Vous' },

    // Withdraw type selector
    'Elija la modalidad de retiro': {
        en: 'Choose your withdrawal modality',
        fr: 'Choisissez votre modalité de retrait',
    },
    'Lionsbit · Paso 1 de 2':     { en: 'Lionsbit · Step 1 of 2', fr: 'Lionsbit · Étape 1 sur 2' },
    'Desbloqueo de retiro parcial': {
        en: 'Partial withdrawal unlock',
        fr: 'Déblocage de retrait partiel',
    },
    'Hasta 40% del saldo disponible': {
        en: 'Up to 40% of available balance',
        fr: 'Jusqu\'à 40% du solde disponible',
    },
    'Retiro total':               { en: 'Full withdrawal',   fr: 'Retrait total' },
    'Acceso al 100% del saldo':   { en: 'Access 100% of the balance', fr: 'Accès à 100% du solde' },
    'Coste':                      { en: 'Cost',              fr: 'Coût' },
    'Pago único':                 { en: 'One-time payment',  fr: 'Paiement unique' },
    'Modalidad parcial':          { en: 'Partial modality',  fr: 'Modalité partielle' },
    'Modalidad total':            { en: 'Full modality',     fr: 'Modalité totale' },
    'Activación rápida del saldo parcial': {
        en: 'Fast partial balance activation',
        fr: 'Activation rapide du solde partiel',
    },
    'Menor coste de activación':  { en: 'Lower activation cost', fr: 'Coût d\'activation réduit' },
    'Ideal para retiros moderados': { en: 'Ideal for moderate withdrawals', fr: 'Idéal pour retraits modérés' },
    'Acceso completo al 100% del saldo': { en: 'Full 100% balance access', fr: 'Accès complet au solde 100%' },
    'Proceso en un solo paso':    { en: 'Single-step process', fr: 'Processus en une étape' },
    'Recomendado para retiros grandes': { en: 'Recommended for large withdrawals', fr: 'Recommandé pour gros retraits' },
    'Elegir esta opción':         { en: 'Choose this option', fr: 'Choisir cette option' },
    'Opción seleccionada':        { en: 'Option selected',   fr: 'Option sélectionnée' },
    'Cambiar selección':          { en: 'Change selection',  fr: 'Changer la sélection' },
    'Confirme su selección':      { en: 'Confirm your selection', fr: 'Confirmez votre sélection' },
    'Cancelar':                   { en: 'Cancel',            fr: 'Annuler' },
    'Confirmar y continuar':      { en: 'Confirm and continue', fr: 'Confirmer et continuer' },
    'Bloqueado · otra opción seleccionada': {
        en: 'Locked · other option selected',
        fr: 'Verrouillé · autre option sélectionnée',
    },

    // Dashboard
    'Próxima acción sugerida':    { en: 'Next suggested action', fr: 'Prochaine action suggérée' },
    'Elija su modalidad de retiro': { en: 'Choose your withdrawal modality', fr: 'Choisissez votre modalité de retrait' },
    'Continuar al selector':      { en: 'Continue to selector', fr: 'Continuer vers le sélecteur' },
    'Parcial · 40%':              { en: 'Partial · 40%',     fr: 'Partiel · 40%' },
    'Total · 100%':               { en: 'Full · 100%',       fr: 'Total · 100%' },

    // Generic
    'Cancelar':                   { en: 'Cancel',            fr: 'Annuler' },
    'Confirmar':                  { en: 'Confirm',           fr: 'Confirmer' },
    'Aceptar':                    { en: 'Accept',            fr: 'Accepter' },
    'Cerrar':                     { en: 'Close',             fr: 'Fermer' },
    'Guardar':                    { en: 'Save',              fr: 'Enregistrer' },
};

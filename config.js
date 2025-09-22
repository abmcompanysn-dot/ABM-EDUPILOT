/* ================================================================== */
/*               FICHIER DE CONFIGURATION DU FRONTEND                 */
/* ================================================================== */

// --- IMPORTANT ---
// Remplacez la valeur ci-dessous par l'URL de déploiement de votre
// script Google Apps Script.
// Pour l'obtenir :
// 1. Ouvrez votre projet Apps Script.
// 2. Cliquez sur "Déployer" > "Gérer les déploiements".
// 3. Assurez-vous que votre déploiement est de type "Application Web".
// 4. Copiez l'URL de l'application Web et collez-la ici.
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby1xMnIuuaYXJOytfnvTVcMxjE7PD4LcGSZucZr-4cBFqsAgVT9-NsigID9bXyjox7h8A/exec';
// CORRECTION: Utilisation des noms de clés de session cohérents avec les autres fichiers.
// --- Clés de session et autres constantes ---
const ADMIN_SESSION_KEY = 'abm_admin_token';
const STUDENT_SESSION_KEY = 'abm_student_token';
const RESPONSABLE_SESSION_KEY = 'abm_responsable_token';

// --- URL des pages ---
const PAGE_URLS = {
    HOME: 'index.html',
    ADMIN: 'admin.html',
    STUDENT: 'etudiant.html',
    RESPONSABLE: 'responsable.html'
};

// --- ID Client Google (doit correspondre à celui du backend) ---
const GOOGLE_CLIENT_ID = "861525588418-llkf68sghrjta6aqghrs4map3hdl74g5.apps.googleusercontent.com";


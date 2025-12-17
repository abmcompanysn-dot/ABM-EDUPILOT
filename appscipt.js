// ============================================================================
// SYSTÈME DE GESTION UNIVERSITAIRE - ABM
// Développé par Africa Business Manager
// Version 2.0 - 2024 (avec API pour formulaire externe)
// ============================================================================

// --- CONFIGURATION GLOBALE ---
const SHEET_NAMES = {
  DASHBOARD: 'Tableau de Bord',      // NOUVEAU
  CONFIG: 'Configuration',
  STUDENTS: 'Étudiants',
  PLANNING: 'Planning',
  SCAN: 'Scan',
  CONDUCT: 'Conduite',
  PASSWORD_RESETS: 'PasswordResets', // NOUVEAU
  ADMINS: 'Administrateurs',
  UNIVERSITIES: 'Universités',
  FILIERES: 'Filières',
  CLASSES: 'Classes',
  RESPONSABLES: 'Responsables', // NOUVEAU
  ACTION_LOG: 'Historique_Actions', // NOUVEAU
  ERROR_LOG: 'Historique_Erreurs',   // NOUVEAU
  MODULES: 'Modules', // NOUVEAU
  MESSAGES: 'Messages' // NOUVEAU: Pour les notifications
, // NOUVEAU: Ajout de la feuille pour les avis
  AVIS: 'Avis',
  MESSAGE_READS: 'Lectures_Messages' // NOUVEAU: Pour suivre les lectures
};

const CONFIG_KEYS = {
  ADMIN_EMAIL: 'ADMIN_EMAIL',
  FRONTEND_URL: 'FRONTEND_URL', // NOUVEAU: Pour l'URL de votre site Netlify/Vercel
  ADMIN_KEY: 'ADMIN_KEY', // NOUVEAU: Pour sécuriser le panneau d'administration
};

// ============================================================================
// POINT D'ENTRÉE WEB APP (doGet pour QR Codes, doPost pour API)
// ============================================================================

/**
 * NOUVEAU: Affiche la barre latérale d'exportation.
 */
function showExportDialog() {
  const html = HtmlService.createHtmlOutputFromFile('ExportSidebar')
      .setTitle('Exportation de Données')
      .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}
/**
 * Gère les requêtes GET (scans de QR Code).
 */
function doGet(e) {
  // La fonction doGet n'est plus utilisée pour servir des pages HTML.
  // Tout le frontend est maintenant géré par un service externe (Netlify/Vercel).
  // On peut la garder pour des tests de connectivité simples.
  return createJsonResponse({ success: true, message: 'ABM EduPilote Backend v3.0 - Actif' });
}

/**
 * NOUVEAU : Gère les requêtes POST (API pour le formulaire Vercel).
 * C'est le routeur principal pour les actions externes.
 */
function doPost(e) {
  try {
    // On parse les données envoyées par le formulaire Vercel
    const request = JSON.parse(e.postData.contents);

    // Logs de débogage pour voir la requête entrante
    Logger.log('--- NOUVELLE REQUÊTE ---');
    Logger.log(`Action reçue: "${request.action}"`);
    Logger.log(`Données reçues: ${JSON.stringify(request.data)}`);
    
    if (!request.action) {
      return createJsonResponse({ success: false, error: 'Action non spécifiée.' });
    }

    // Routeur d'actions simple pour garantir la reconnaissance
    const action = request.action;
    const data = request.data;

    // NOUVEAU: Créer un contexte de requête pour optimiser les lectures de feuilles
    const ctx = createRequestContext();

    if (action === 'recordAttendance') {
      return recordAttendance(data);
    } else if (action === 'registerSchool') {
      return registerSchool(data);
    } else if (action === 'loginSchool') {
      return loginSchool(data);
    } else if (action === 'adminGetEntities') {
      return getEntitiesForAdmin(data);
    } else if (action === 'requestPasswordReset') {
      return requestPasswordReset(data);
    } else if (action === 'exportDataToDrive') { // NOUVEAU: Action pour l'export depuis le Sheet
      return exportDataToDrive(data);
    } else if (action === 'getClassDetails') {
      return getClassDetails(data);
    } else if (action === 'adminAddEntity') {
      return addEntityForAdmin(data);
    } else if (action === 'adminBulkAddEntities') { // NOUVEAU
      return adminBulkAddEntities(data);
    } else if (action === 'registerStudentInClass') {
      return registerStudentInClass(data);
    } else if (action === 'adminGetQrCodes') {
      return generateQrCodeUrlsForAdmin(data);
    } else if (action === 'adminGetRegLinks') {
      return generateRegistrationLinksForAdmin(data);
    } else if (action === 'adminGetPlanning') { // NOUVEAU
      return getPlanningForAdmin(data);
    } else if (action === 'adminAddCourse') { // NOUVEAU
      return addCourseForAdmin(data);
    } else if (action === 'adminDeleteCourse') { // NOUVEAU
      return deleteCourseForAdmin(data);
    } else if (action === 'adminGetAttendance') { // NOUVEAU
      return getAttendanceForAdmin(data);
    } else if (action === 'studentLogin') { // NOUVEAU
      return studentLogin(data);
    } else if (action === 'getStudentDashboardData') { // NOUVEAU: Action optimisée
      return getStudentDashboardData(data);
    } else if (action === 'getStudentData') { // NOUVEAU
      return getStudentData(data);
    } else if (action === 'updateStudentInfo') { // NOUVEAU
      return updateStudentInfo(data);
    } else if (action === 'getStudentSchedule') { // NOUVEAU
      return getStudentSchedule(data);
    } else if (action === 'getStudentAttendanceHistory') { // NOUVEAU
      return getStudentAttendanceHistory(data);
    } else if (action === 'adminGetResponsables') { // NOUVEAU
      return getResponsablesForAdmin(data);
    } else if (action === 'adminAddResponsable') { // NOUVEAU
      return addResponsableForAdmin(data);
    } else if (action === 'responsableLogin') { // NOUVEAU
      return responsableLogin(data);
    } else if (action === 'responsableGetDashboardData') { // NOUVEAU
      return getResponsableDashboardData(data);
    } else if (action === 'responsableUpdateCourseStatus') { // NOUVEAU
      return updateCourseStatusForResponsable(data);
    } else if (action === 'responsableAddCourse') { // NOUVEAU
      return addCourseForResponsable(data);
    } else if (action === 'responsableGetRegLink') { // NOUVEAU
      return getRegLinkForResponsable(data);
    } else if (action === 'responsableGetStudents') { // NOUVEAU
      return responsableGetStudents(data);
    } else if (action === 'responsableGetAttendance') { // NOUVEAU
      return responsableGetAttendance(data);
    } else if (action === 'responsableGetStudentDetails') { // NOUVEAU
      return responsableGetStudentDetails(data);
    } else if (action === 'responsableGetCurrentCourse') { // NOUVEAU
      return responsableGetCurrentCourse(data, ctx);
    } else if (action === 'responsableGetModules') { // NOUVEAU
      return responsableGetModules(data);
    } else if (action === 'responsableUpdateModuleStatus') { // NOUVEAU
      return responsableUpdateModuleStatus(data);
    } else if (action === 'responsableExportModulesSummary') { // NOUVEAU
      return responsableExportModulesSummary(data);
    } else if (action === 'responsableDeleteCourse') { // NOUVEAU
      return deleteCourseForResponsable(data);
    } else if (action === 'responsableGetQrCode') { // NOUVEAU
      return getQrCodeForResponsable(data);
    } else if (action === 'adminGetDashboardStats') { // NOUVEAU
      return getAdminDashboardStats(data);
    } else if (action === 'adminDeleteEntity') { // NOUVEAU
      return adminDeleteEntity(data);
    } else if (action === 'adminGetStudents') { // NOUVEAU
      return getStudentsForAdmin(data);
    } else if (action === 'adminGetStudentProfile') { // NOUVEAU
      return getStudentProfileForAdmin(data);
    } else if (action === 'adminExportData') { // NOUVEAU
      return exportDataForAdmin(data);
    } else if (action === 'responsableExportAttendanceByModule') { // NOUVEAU (RENOMMÉ)
      return responsableExportAttendanceByModule(data);
    } else if (action === 'adminGetAttendanceStats') { // NOUVEAU
      return adminGetAttendanceStats(data);
    } else if (action === 'adminGetModulesForClass') { // NOUVEAU
      return adminGetModulesForClass(data);
    } else if (action === 'getPublicStudentProfile') { // NOUVEAU
      return getPublicStudentProfile(data);
    } else if (action === 'getUniversityInfo') { // NOUVEAU: Ajout de l'action manquante
      return getUniversityInfo(data);
    } else if (action === 'getCurrentCourse') { // CORRECTION: Réintroduction de l'action
      return getCurrentCourse(data);
    } else if (action === 'recordAttendanceFromScan') { // NOUVEAU: Pour le scan étudiant
      return recordAttendanceFromScan(data, ctx);
    } else if (action === 'scanStudentForAttendance') { // CORRECTION: Réintroduction de l'action
        return scanStudentForAttendance(data, ctx);
    } else if (action === 'adminSendNotification') { // NOUVEAU
        return adminSendNotification(data);
    } else if (action === 'responsableSendMessageToClass') { // NOUVEAU
        return responsableSendMessageToClass(data, ctx);
    } else if (action === 'responsableExportAbsenceReport') { // NOUVEAU
        return responsableExportAbsenceReport(data, ctx);
    } else if (action === 'responsableGetModuleAttendanceDetails') { // NOUVEAU
        return responsableGetModuleAttendanceDetails(data, ctx);
    } else if (action === 'responsableExportModuleReport') { // NOUVEAU
        return responsableExportModuleReport(data, ctx);
    } else if (action === 'responsableGetSentMessages') { // NOUVEAU
        return responsableGetSentMessages(data, ctx);
    } else if (action === 'responsableDeleteMessage') { // NOUVEAU
        return responsableDeleteMessage(data, ctx);
    } else if (action === 'adminGetSentMessages') { // NOUVEAU
        return adminGetSentMessages(data, ctx);
    } else if (action === 'adminDeleteMessage') { // NOUVEAU 
        return adminDeleteMessage(data, ctx);
    } else if (action === 'adminSendMessageToClass') { // NOUVEAU
        return adminSendMessageToClass(data);
    } else if (action === 'getUserNotifications') { // NOUVEAU
        return getUserNotifications(data, ctx);
    } else if (action === 'getUserNotificationStatus') { // NOUVEAU
        return getUserNotificationStatus(data, ctx);
    } else if (action === 'adminForceRefresh') { // NOUVEAU
        return adminForceRefresh(data);
    } else if (action === 'responsableForceRefresh') { // NOUVEAU
        return responsableForceRefresh(data);
    } else if (action === 'responsableAddModule') { // NOUVEAU: Ajout de l'action manquante
        return responsableAddModule(data);
    } else if (action === 'responsableGetStudentsForRfid') { // NOUVEAU: Pour RFID
        return responsableGetStudentsForRfid(data);
    } else if (action === 'responsableAssignRfid') { // NOUVEAU: Pour RFID
        return responsableAssignRfid(data);
    } else if (action === 'responsableUpdateRfid') { // NOUVEAU: Pour RFID
        return responsableUpdateRfid(data);
    } else if (action === 'responsableRemoveRfid') { // NOUVEAU: Pour RFID
        return responsableRemoveRfid(data);
    } else if (action === 'responsableRecordRfidAttendance') { // NOUVEAU: Pour RFID
        return responsableRecordRfidAttendance(data);
    } else if (action === 'responsableGetAbsenceStats') { // NOUVEAU: Pour le graphe du responsable
        return responsableGetAbsenceStats(data, ctx);
    } else if (action === 'responsableMarkOnlineAttendance') { // NOUVEAU: Pour le pointage en ligne
        return responsableMarkOnlineAttendance(data, ctx);
    } else if (action === 'responsableGetLastConfirmedCourse') { // NOUVEAU: Pour le pointage en ligne simplifié
        return responsableGetLastConfirmedCourse(data, ctx);
    } else if (action === 'responsableGetStudentsForOnlineAttendance') { // NOUVEAU: Pour le pointage en ligne
        return responsableGetStudentsForOnlineAttendance(data, ctx);
    } else if (action === 'getStudentAbsenceReport') { // NOUVEAU: Pour le rapport de l'étudiant
        return getStudentAbsenceReport(data, ctx);
    } else if (action === 'getStudentAbsenceReport') { // NOUVEAU: Pour le rapport de l'étudiant
        return getStudentAbsenceReport(data, ctx);
    } else if (action === 'adminGetAssiduiteStats') { // NOUVEAU: Pour le graphe admin
        return adminGetAssiduiteStats(data, ctx);
    } else if (action === 'submitFeedback') { // NOUVEAU: Pour les avis
        return submitFeedback(data);
    } else if (action === 'adminGetStudentByRfid') { // NOUVEAU: Pour la recherche RFID par l'admin
        return adminGetStudentByRfid(data);
    } else {
      // Si l'action n'est pas dans notre liste, on renvoie une erreur
      Logger.log(`Action "${request.action}" non reconnue.`);
      return createJsonResponse({ success: false, error: 'Action non reconnue.' });
    }

  } catch (error) {
    logError(e.postData.contents, error); // Enregistre l'erreur dans la feuille
    return createJsonResponse({ success: false, error: `Erreur serveur: ${error.message}. L'incident a été enregistré.` });
  }
}

/**
 * NOUVEAU: ACTION: submitFeedback
 * Enregistre un avis ou un retour d'utilisateur dans la feuille 'Avis'.
 * @param {object} data - Contient { userRole, userId, ratings, corrections, ideas }.
 * @returns {object} JSON response avec un message de succès.
 */
function submitFeedback(data) {
    try {
        const { userRole, userId, ratings, corrections, ideas, starRating } = data; // NOUVEAU: Ajout de starRating
        if (!userRole || !userId || !ratings) {
            throw new Error("Données d'avis incomplètes.");
        }

        const avisSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.AVIS);
        const timestamp = new Date();

        // Convertir l'objet des notes en une chaîne de caractères lisible
        const ratingsString = Object.entries(ratings).map(([key, value]) => `${key}: ${value}`).join('; ');

        avisSheet.appendRow([timestamp, userRole, userId, ratingsString, corrections || '', ideas || '', starRating || '0']); // NOUVEAU: Ajout de starRating

        return createJsonResponse({ success: true, message: "Merci beaucoup ! Votre avis a été enregistré avec succès." });

    } catch (error) {
        logError('submitFeedback', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
// ============================================================================
// NOUVEAU: FONCTIONS POUR LA GESTION RFID
// ============================================================================

/**
 * NOUVEAU: ACTION: responsableGetAbsenceStats
 * Calcule le nombre total d'absences par module pour la classe d'un responsable.
 * @param {object} data - Contient { responsableId }.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {object} JSON response avec les données pour le graphique.
 */
function responsableGetAbsenceStats(data, ctx) {
    try {
        const { responsableId } = data;
        if (!responsableId) throw new Error("ID du responsable manquant.");

        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId } = classInfo;

        // 1. Récupérer les modules de la classe
        const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
        const classModules = modulesData.slice(1)
            .filter(row => row[2] === classId) // ID_CLASSE_FK est à l'index 2
            .map(row => ({ id: row[0], name: row[1] }));

        // 2. Compter le nombre total de sessions confirmées pour chaque module
        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const sessionsParModule = planningData.slice(1).reduce((acc, row) => {
            const moduleId = row[1]; // ID_MODULE_FK
            const status = row[5]; // STATUT
            if (status === 'Confirmé') {
                acc[moduleId] = (acc[moduleId] || 0) + 1;
            }
            return acc;
        }, {});

        // 3. Compter le nombre d'étudiants dans la classe
        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const studentCount = studentsData.slice(1).filter(row => row[3] === classId).length; // ID_CLASSE_FK

        // 4. Compter les présences effectives par module
        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const presencesParModule = scanData.slice(1).reduce((acc, row) => {
            const moduleName = row[4]; // MODULE
            acc[moduleName] = (acc[moduleName] || 0) + 1;
            return acc;
        }, {});

        // 5. Calculer les absences
        const absenceStats = classModules.map(module => {
            const totalSessions = sessionsParModule[module.id] || 0;
            const totalPresencesPossibles = totalSessions * studentCount;
            const presencesReelles = presencesParModule[module.name] || 0;
            const totalAbsences = Math.max(0, totalPresencesPossibles - presencesReelles);
            return { moduleName: module.name, totalAbsences };
        }).filter(stat => stat.totalAbsences > 0) // Ne garder que les modules avec des absences
          .sort((a, b) => b.totalAbsences - a.totalAbsences); // Trier par le plus grand nombre d'absences

        return createJsonResponse({ success: true, data: absenceStats });

    } catch (error) {
        logError('responsableGetAbsenceStats', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: ACTION: getStudentAbsenceReport
 * Récupère la liste des cours où un étudiant a été absent.
 * @param {object} data - Contient { studentId }.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {object} JSON response avec la liste des cours manqués.
 */
function getStudentAbsenceReport(data, ctx) {
    try {
        const { studentId } = data;
        if (!studentId) throw new Error("ID de l'étudiant manquant.");

        const studentMap = getStudentMap();
        const studentInfo = studentMap[studentId.toUpperCase()];
        if (!studentInfo) throw new Error("Étudiant non trouvé.");

        // 1. Récupérer tous les cours confirmés pour la classe de l'étudiant
        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], { name: row[1], classId: row[2] }]));
        
        const scheduledCourses = planningData.slice(1).filter(row => {
            const module = moduleMap.get(row[1]); // ID_MODULE_FK
            return module && module.classId === studentInfo.classId && row[5] === 'Confirmé'; // STATUT
        }).map(row => ({
            date: Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), 'yyyy-MM-dd'), // DATE_COURS
            module: moduleMap.get(row[1]).name
        }));

        // 2. Récupérer toutes les présences de l'étudiant
        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const studentPresences = new Set(
            scanData.slice(1)
            .filter(row => row[1] === studentId) // ID_ETUDIANT
            .map(row => `${Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), 'yyyy-MM-dd')}_${row[4]}`) // DATE_SCAN + MODULE
        );

        // 3. Comparer pour trouver les absences
        const absenceReport = scheduledCourses.filter(course => {
            const presenceKey = `${course.date}_${course.module}`;
            return !studentPresences.has(presenceKey);
        });

        return createJsonResponse({ success: true, data: absenceReport });

    } catch (error) {
        logError('getStudentAbsenceReport', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: ACTION: getStudentAbsenceReport
 * Récupère la liste des cours où un étudiant a été absent.
 * @param {object} data - Contient { studentId }.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {object} JSON response avec la liste des cours manqués.
 */
function getStudentAbsenceReport(data, ctx) {
    try {
        const { studentId } = data;
        if (!studentId) throw new Error("ID de l'étudiant manquant.");

        const studentMap = getStudentMap();
        const studentInfo = studentMap[studentId.toUpperCase()];
        if (!studentInfo) throw new Error("Étudiant non trouvé.");

        // 1. Récupérer tous les cours confirmés pour la classe de l'étudiant
        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], { name: row[1], classId: row[2] }]));
        
        const scheduledCourses = planningData.slice(1).filter(row => {
            const module = moduleMap.get(row[1]); // ID_MODULE_FK
            return module && module.classId === studentInfo.classId && row[5] === 'Confirmé'; // STATUT
        }).map(row => ({
            date: Utilities.formatDate(new Date(row[2]), Session.getScriptTimeZone(), 'yyyy-MM-dd'), // DATE_COURS
            module: moduleMap.get(row[1]).name
        }));

        // 2. Récupérer toutes les présences de l'étudiant
        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const studentPresences = new Set(
            scanData.slice(1)
            .filter(row => row[1] === studentId) // ID_ETUDIANT
            .map(row => `${Utilities.formatDate(new Date(row[5]), Session.getScriptTimeZone(), 'yyyy-MM-dd')}_${row[4]}`) // DATE_SCAN + MODULE
        );

        // 3. Comparer pour trouver les absences
        const absenceReport = scheduledCourses.map(course => {
            const presenceKey = `${course.date}_${course.module}`;
            return { ...course, status: studentPresences.has(presenceKey) ? 'Présent' : 'Absent' };
        }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Trier par date la plus récente

        return createJsonResponse({ success: true, data: absenceReport });

    } catch (error) {
        logError('getStudentAbsenceReport', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/** NOUVEAU: Logique pour le graphe d'assiduité admin (similaire à l'existant mais séparé pour clarté) */
function adminGetAssiduiteStats(data, ctx) {
    return adminGetAttendanceStats(data); // Réutilise la fonction existante qui contient déjà les données nécessaires
}

/**
 * NOUVEAU: ACTION: adminGetStudentByRfid
 * Recherche un étudiant par son ID de carte RFID pour un administrateur.
 * @param {object} data - Contient { rfidId, universityId }.
 * @returns {object} JSON response avec les données complètes du profil de l'étudiant.
 */
function adminGetStudentByRfid(data) {
  try {
    const { rfidId, universityId } = data;
    if (!rfidId || !universityId) {
      throw new Error("L'ID RFID et l'ID de l'université sont requis.");
    }

    // 1. Trouver l'étudiant correspondant à la carte RFID
    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
    const studentsData = studentsSheet.getDataRange().getValues();
    const headers = studentsData[0];
    const rfidIdx = headers.indexOf('ID_RFID');
    const studentIdIdx = headers.indexOf('ID_ETUDIANT');

    if (rfidIdx === -1) {
      throw new Error("La colonne 'ID_RFID' est introuvable dans la feuille Étudiants. Veuillez mettre à jour le système via le menu.");
    }

    // CORRECTION: Convertir les deux valeurs en chaîne de caractères avant la comparaison
    // pour éviter les problèmes de type (nombre vs chaîne).
    // AMÉLIORATION: Convertir en nombres pour ignorer les zéros non significatifs (ex: 00123 vs 123).
    const studentRow = studentsData.slice(1).find(row => row[rfidIdx] && Number(row[rfidIdx]) === Number(rfidId));

    if (!studentRow) {
      throw new Error(`Aucun étudiant trouvé avec l'ID RFID : ${rfidId}`);
    }

    const studentId = studentRow[studentIdIdx];

    // 2. Réutiliser la fonction existante pour récupérer le profil complet.
    // Elle contient déjà la logique de jointure (classe, filière) et la vérification de sécurité.
    return getStudentProfileForAdmin({ studentId, universityId });

  } catch (error) {
    logError('adminGetStudentByRfid', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * ACTION: responsableGetStudentsForRfid
 * Récupère les listes d'étudiants d'une classe, séparés entre ceux qui ont une carte RFID et ceux qui n'en ont pas.
 * @param {object} data - { responsableId, universityId }
 * @returns {object} { success: true, data: { studentsWithCard: [], studentsWithoutCard: [] } }
 */
function responsableGetStudentsForRfid(data) {
  const { responsableId, universityId } = data;
  const classeId = getResponsableClassId(responsableId, universityId);
  if (!classeId) {
    return createJsonResponse({ success: false, error: "Responsable non trouvé ou non associé à une classe." });
  }

  const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
  const allStudentsData = studentsSheet.getDataRange().getValues();
  const headers = allStudentsData.shift();
  
  const col = {
      ID_ETUDIANT: headers.indexOf('ID_ETUDIANT'), 
      NOM_COMPLET: headers.indexOf('NOM_COMPLET'), 
      ID_CLASSE_FK: headers.indexOf('ID_CLASSE_FK'),
      ID_CARTE_RFID: headers.indexOf('ID_RFID') // Assurez-vous que le nom de colonne est correct
  };

  if (Object.values(col).includes(-1)) {
      return createJsonResponse({ success: false, error: "Une ou plusieurs colonnes requises sont introuvables dans la feuille Étudiants." });
  }

  const studentsWithCard = [];
  const studentsWithoutCard = [];

  allStudentsData.forEach(row => {
    if (row[col.ID_CLASSE_FK] == classeId) {
      const student = {
        ID_ETUDIANT: row[col.ID_ETUDIANT],
        NOM_COMPLET: row[col.NOM_COMPLET],
        ID_CARTE_RFID: row[col.ID_CARTE_RFID]
      };
      if (student.ID_CARTE_RFID) {
        studentsWithCard.push(student);
      } else {
        studentsWithoutCard.push(student);
      }
    }
  });

  return createJsonResponse({ success: true, data: { studentsWithCard, studentsWithoutCard } });
}


/**
 * ACTION: responsableAssignRfid
 * Assigne un ID de carte RFID à un étudiant.
 * @param {object} data - { responsableId, universityId, studentId, rfidId }
 * @returns {object} { success: true, message: "..." }
 */
function responsableAssignRfid(data) {
  const { responsableId, universityId, studentId, rfidId } = data;
  
  // 1. Vérifier que le responsable est légitime
  const classeId = getResponsableClassId(responsableId, universityId);
  if (!classeId) {
    return createJsonResponse({ success: false, error: "Accès non autorisé." });
  }

  const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
  const allStudentsData = studentsSheet.getDataRange().getValues();
  const headers = allStudentsData[0];
  const col = {
      ID_ETUDIANT: headers.indexOf('ID_ETUDIANT'), 
      ID_CLASSE_FK: headers.indexOf('ID_CLASSE_FK'),
      ID_CARTE_RFID: headers.indexOf('ID_RFID')
  };

  // 2. Vérifier que la carte n'est pas déjà utilisée
  for (let i = 1; i < allStudentsData.length; i++) {
    if (allStudentsData[i][col.ID_CARTE_RFID] == rfidId) {
      return createJsonResponse({ success: false, error: `Cette carte RFID est déjà assignée à un autre étudiant (ID: ${allStudentsData[i][col.ID_ETUDIANT]}).` });
    }
  }

  // 3. Trouver l'étudiant et assigner la carte
  for (let i = 1; i < allStudentsData.length; i++) {
    if (allStudentsData[i][col.ID_ETUDIANT] == studentId) {
      // Vérifier que l'étudiant est bien dans la classe du responsable
      if (allStudentsData[i][col.ID_CLASSE_FK] != classeId) {
        return createJsonResponse({ success: false, error: "Cet étudiant ne fait pas partie de votre classe." });
      }
      studentsSheet.getRange(i + 1, col.ID_CARTE_RFID + 1).setValue(rfidId);
      return createJsonResponse({ success: true, message: `La carte RFID a été assignée avec succès à l'étudiant ${studentId}.` });
    }
  }

  return createJsonResponse({ success: false, error: "Étudiant non trouvé." });
}

/**
 * NOUVEAU: ACTION: responsableUpdateRfid
 * Met à jour l'ID de la carte RFID pour un étudiant.
 * @param {object} data - { responsableId, universityId, studentId, newRfidId }
 * @returns {object} { success: true, message: "..." }
 */
function responsableUpdateRfid(data) {
  try {
    const { responsableId, universityId, studentId, newRfidId } = data;
    if (!responsableId || !universityId || !studentId || !newRfidId) {
      throw new Error("Données incomplètes pour la mise à jour de la carte RFID.");
    }

    // 1. Vérifier que le responsable est légitime
    const classeId = getResponsableClassId(responsableId, universityId);
    if (!classeId) {
      return createJsonResponse({ success: false, error: "Accès non autorisé." });
    }

    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
    const allStudentsData = studentsSheet.getDataRange().getValues();
    const headers = allStudentsData[0];
    const col = {
        ID_ETUDIANT: headers.indexOf('ID_ETUDIANT'),
        ID_CLASSE_FK: headers.indexOf('ID_CLASSE_FK'),
        ID_CARTE_RFID: headers.indexOf('ID_RFID')
    };

    // 2. Vérifier que la nouvelle carte n'est pas déjà utilisée par un autre étudiant
    for (let i = 1; i < allStudentsData.length; i++) {
      if (allStudentsData[i][col.ID_ETUDIANT] !== studentId && allStudentsData[i][col.ID_CARTE_RFID] == newRfidId) {
        return createJsonResponse({ success: false, error: `Cette carte RFID est déjà assignée à un autre étudiant (ID: ${allStudentsData[i][col.ID_ETUDIANT]}).` });
      }
    }

    // 3. Trouver l'étudiant et mettre à jour la carte
    for (let i = 1; i < allStudentsData.length; i++) {
      if (allStudentsData[i][col.ID_ETUDIANT] == studentId) {
        // Vérifier que l'étudiant est bien dans la classe du responsable
        if (allStudentsData[i][col.ID_CLASSE_FK] != classeId) {
          return createJsonResponse({ success: false, error: "Cet étudiant ne fait pas partie de votre classe." });
        }
        studentsSheet.getRange(i + 1, col.ID_CARTE_RFID + 1).setValue(newRfidId);
        logAction('responsableUpdateRfid', { responsableId, studentId, newRfidId });
        return createJsonResponse({ success: true, message: `La carte RFID de l'étudiant ${studentId} a été mise à jour.` });
      }
    }

    return createJsonResponse({ success: false, error: "Étudiant non trouvé." });
  } catch (error) {
    logError('responsableUpdateRfid', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: ACTION: responsableRemoveRfid
 * Supprime l'assignation d'une carte RFID pour un étudiant.
 * @param {object} data - { responsableId, universityId, studentId }
 * @returns {object} { success: true, message: "..." }
 */
function responsableRemoveRfid(data) {
  try {
    const { responsableId, universityId, studentId } = data;
    if (!responsableId || !universityId || !studentId) {
      throw new Error("Données incomplètes pour la suppression de la carte RFID.");
    }

    // 1. Vérifier que le responsable est légitime
    const classeId = getResponsableClassId(responsableId, universityId);
    if (!classeId) {
      return createJsonResponse({ success: false, error: "Accès non autorisé." });
    }

    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
    const allStudentsData = studentsSheet.getDataRange().getValues();
    const headers = allStudentsData[0];
    const studentIdCol = headers.indexOf('ID_ETUDIANT');
    const rfidCol = headers.indexOf('ID_RFID');

    const studentRowIndex = allStudentsData.findIndex(row => row[studentIdCol] === studentId);

    if (studentRowIndex === -1) return createJsonResponse({ success: false, error: "Étudiant non trouvé." });

    studentsSheet.getRange(studentRowIndex + 1, rfidCol + 1).setValue(''); // Efface la valeur
    logAction('responsableRemoveRfid', { responsableId, studentId });
    return createJsonResponse({ success: true, message: `L'assignation de la carte RFID pour l'étudiant ${studentId} a été supprimée.` });
  } catch (error) {
    logError('responsableRemoveRfid', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Crée et met en cache une map des étudiants par ID RFID pour des recherches rapides.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {Map<string, object>} Une map où les clés sont les ID RFID.
 */
function getStudentMapByRfid(ctx) {
    const cacheKey = 'all_students_map_by_rfid';
    return getCachedData(cacheKey, () => {
        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const headers = studentsData[0];
        const idIdx = headers.indexOf('ID_ETUDIANT');
        const nameIdx = headers.indexOf('NOM_COMPLET');
        const classIdx = headers.indexOf('ID_CLASSE_FK');
        const rfidIdx = headers.indexOf('ID_RFID');

        if (rfidIdx === -1) throw new Error("La colonne 'ID_RFID' est introuvable dans la feuille Étudiants.");

        const map = new Map();
        studentsData.slice(1).forEach(row => { if (row[rfidIdx]) map.set(row[rfidIdx].toString(), { id: row[idIdx], name: row[nameIdx], classId: row[classIdx] }); });
        return Object.fromEntries(map); // Convertir en objet pour la sérialisation du cache
    }, 300); // Cache de 5 minutes
}

/**
 * ACTION: responsableRecordRfidAttendance
 * Enregistre la présence d'un étudiant via un scan de carte RFID.
 * @param {object} data - { responsableId, universityId, rfidId }
 * @returns {object} { success: true, message: "..." }
 */
function responsableRecordRfidAttendance(data) {
  const { responsableId, universityId, rfidId } = data;
  const ctx = createRequestContext(); // AMÉLIORATION: Utiliser le contexte pour optimiser

  // 1. Vérifier le responsable et trouver le cours actuel
  const classeId = getResponsableClassId(responsableId, universityId);
  if (!classeId) return createJsonResponse({ success: false, error: "Accès non autorisé." });

  const courseResponse = responsableGetCurrentCourse({ responsableId }, ctx);
  const currentCourseResult = JSON.parse(courseResponse.getContent());
  if (!currentCourseResult.success) {
    return createJsonResponse({ success: false, error: "Aucun cours n'est actuellement en session pour cette classe." });
  }
  const currentCourse = currentCourseResult.data;

  // 2. AMÉLIORATION: Trouver l'étudiant via la map RFID mise en cache (beaucoup plus rapide)
  const studentMapByRfid = getStudentMapByRfid(ctx);
  const studentInfo = studentMapByRfid[rfidId.toString()];

  if (!studentInfo) {
    return createJsonResponse({ success: false, error: `Carte RFID non reconnue: ${rfidId}` });
  }

  // 3. Vérifier que l'étudiant est dans la bonne classe
  if (studentInfo.classId !== classeId) {
    return createJsonResponse({ success: false, error: `L'étudiant ${studentInfo.name} n'appartient pas à cette classe.` });
  }

  // 4. Enregistrer la présence (logique similaire à scanStudentForAttendance)
  // AMÉLIORATION: Utiliser le contexte pour lire les données de présence
  const presencesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN); // Garder pour l'écriture
  const presencesData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
  const presencesHeaders = presencesData[0];
  const presencesCol = {
      ID_ETUDIANT: presencesHeaders.indexOf('ID_ETUDIANT'),
      MODULE: presencesHeaders.indexOf('MODULE'),
      DATE_SCAN: presencesHeaders.indexOf('DATE_SCAN')
  };

  // CORRECTION: Vérifier si l'étudiant est déjà présent pour ce cours aujourd'hui.
  const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (let i = 1; i < presencesData.length; i++) {
    const scanDate = presencesData[i][presencesCol.DATE_SCAN];
    const scanDateStr = scanDate instanceof Date ? Utilities.formatDate(scanDate, Session.getScriptTimeZone(), 'yyyy-MM-dd') : scanDate;

    if (presencesData[i][presencesCol.ID_ETUDIANT] == studentInfo.id && presencesData[i][presencesCol.MODULE] == currentCourse.module && scanDateStr == todayStr) {
      return createJsonResponse({ success: true, message: `${studentInfo.name} est déjà marqué(e) présent(e).` });
    }
  }
  // FIN CORRECTION

  const timestamp = new Date();
  presencesSheet.appendRow([
    timestamp, // TIMESTAMP
    studentInfo.id, // ID_ETUDIANT
    studentInfo.name, // NOM_ETUDIANT
    currentCourse.classe, // CLASSE
    currentCourse.module, // MODULE
    todayStr, // DATE_SCAN
    Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm:ss'), // HEURE_SCAN
    'Présent' // STATUT_PRESENCE
  ]);

  return createJsonResponse({ success: true, message: `Présence de ${studentInfo.name} confirmée pour le cours de ${currentCourse.module}.` });
}

/**
 * NOUVEAU: Helper pour récupérer l'ID de la classe d'un responsable.
 * @param {string} responsableId - L'ID du responsable.
 * @param {string} universityId - L'ID de l'université.
 * @returns {string|null} L'ID de la classe ou null si non trouvé.
 */
function getResponsableClassId(responsableId, universityId) {
    const respSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESPONSABLES);
    const respData = respSheet.getDataRange().getValues();
    const headers = respData.shift();
    const idIdx = headers.indexOf('ID_RESPONSABLE');
    const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');
    const classFkIdx = headers.indexOf('ID_CLASSE_FK');

    for (const row of respData) {
        if (row[idIdx] === responsableId && row[univFkIdx] === universityId) {
            return row[classFkIdx];
        }
    }
    return null;
}

/**
 * NOUVEAU: Enregistre la présence d'un étudiant qui a scanné un QR code de cours.
 * @param {object} data - Contient { studentId, classe }.
 * @param {object} ctx - Le contexte de la requête.
 */
function recordAttendanceFromScan(data, ctx) {
  try {
    const { studentId, classe } = data;
    if (!studentId || !classe) {
      throw new Error("ID étudiant ou nom de classe manquant.");
    }

    // 1. Vérifier que l'étudiant existe et appartient bien à la classe scannée.
    const studentMap = getStudentMap();
    const studentInfo = studentMap[studentId.trim().toUpperCase()];
    if (!studentInfo) throw new Error(`Étudiant avec l'ID ${studentId} non trouvé.`);

    const classInfo = getCachedData(`class_info_by_name_${classe}`, () => {
        const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, ctx);
        const classRow = classesData.slice(1).find(row => row[1].toLowerCase() === classe.toLowerCase());
        return classRow ? { id: classRow[0], name: classRow[1] } : null;
    }, 3600);
    if (!classInfo || studentInfo.classId !== classInfo.id) throw new Error("Vous n'êtes pas inscrit dans la classe pour laquelle vous essayez de pointer.");

    // 2. Trouver le cours actuel et enregistrer la présence.
    return scanStudentForAttendance({ studentId }, ctx);

  } catch (error) {
    logError('recordAttendanceFromScan', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}
/**
 * NOUVEAU: Crée un contexte contenant les données des feuilles fréquemment utilisées.
 * Cela évite de lire les mêmes feuilles plusieurs fois dans une seule requête.
 * @returns {object} Un objet contenant les données des feuilles.
 */
function createRequestContext() {
  try {
    // OPTIMISATION: Pré-charger toutes les feuilles de données importantes en une seule fois.
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    return {
      universities: ss.getSheetByName(SHEET_NAMES.UNIVERSITIES).getDataRange().getValues(),
      filieres: ss.getSheetByName(SHEET_NAMES.FILIERES).getDataRange().getValues(),
      classes: ss.getSheetByName(SHEET_NAMES.CLASSES).getDataRange().getValues(),
      responsables: ss.getSheetByName(SHEET_NAMES.RESPONSABLES).getDataRange().getValues(),
      students: ss.getSheetByName(SHEET_NAMES.STUDENTS).getDataRange().getValues(),
      planning: ss.getSheetByName(SHEET_NAMES.PLANNING).getDataRange().getValues(),
      admins: ss.getSheetByName(SHEET_NAMES.ADMINS).getDataRange().getValues(),
      scan: ss.getSheetByName(SHEET_NAMES.SCAN).getDataRange().getValues(),
      config: ss.getSheetByName(SHEET_NAMES.CONFIG).getDataRange().getValues()
    };
  } catch (e) {
    // En cas d'erreur (ex: une feuille a été renommée), on renvoie un objet vide.
    return {};
  }
}

/**
 * NOUVEAU: Helper interne pour récupérer les données brutes d'une feuille.
 * Priorise les données du contexte de la requête pour éviter les lectures redondantes.
 * @param {string} sheetName - Le nom de l'onglet (ex: SHEET_NAMES.CLASSES).
 * @param {object} ctx - Le contexte de la requête.
 * @returns {Array<Array<string>>} Les données complètes de la feuille.
 */
function _getRawSheetData(sheetName, ctx) {
    const sheetKey = sheetName.toLowerCase();
    // Vérifie si les données sont déjà dans le contexte de la requête.
    if (ctx && ctx[sheetKey]) {
        return ctx[sheetKey];
    }
    // Sinon, lit la feuille de calcul (moins performant).
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
        throw new Error(`Feuille de calcul introuvable: ${sheetName}`);
    }
    return sheet.getDataRange().getValues();
}
// ============================================================================
// FONCTIONS DE L'API (appelées par doPost)
// ============================================================================

/**
 * NOUVEAU: Récupère les messages envoyés par un administrateur pour son université.
 * @param {object} data - Contient { universityId }.
 * @param {object} ctx - Le contexte de la requête.
 */
function adminGetSentMessages(data, ctx) {
    try {
        const { universityId } = data;
        if (!universityId) throw new Error("ID de l'université manquant.");

        const messagesData = _getRawSheetData(SHEET_NAMES.MESSAGES, ctx);
        const headers = studentsData[0];
        const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');
        const authorIdx = headers.indexOf('AUTEUR_INFO');

        const classMap = new Map(_getRawSheetData(SHEET_NAMES.CLASSES, ctx).slice(1).map(row => [row[0], row[1]]));

        const sentMessages = messagesData.slice(1)
            .filter(row => row[univFkIdx] === universityId && row[authorIdx] === "Administration")
            .map(row => {
                const msg = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
                msg.NOM_CLASSE = classMap.get(msg.ID_CLASSE_FK); // Ajouter le nom de la classe pour l'affichage
                return msg;
            })
            .sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));

        return createJsonResponse({ success: true, data: sentMessages });
    } catch (error) {
        logError('adminGetSentMessages', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Supprime un message envoyé par un administrateur.
 * @param {object} data - Contient { universityId, messageId }.
 * @param {object} ctx - Le contexte de la requête.
 */
function adminDeleteMessage(data, ctx) {
    try {
        const { universityId, messageId } = data;
        if (!universityId || !messageId) throw new Error("Données de suppression incomplètes.");

        const messagesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MESSAGES);
        const messagesData = messagesSheet.getDataRange().getValues();
        const headers = messagesData[0];
        const msgIdIdx = headers.indexOf('ID_MESSAGE');
        const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');

        const rowIndexToDelete = messagesData.findIndex((row, index) => index > 0 && row[msgIdIdx] === messageId);

        if (rowIndexToDelete === -1) throw new Error("Message non trouvé.");
        if (messagesData[rowIndexToDelete][univFkIdx] !== universityId) {
            throw new Error("Action non autorisée. Ce message n'appartient pas à votre établissement.");
        }

        messagesSheet.deleteRow(rowIndexToDelete + 1);
        return createJsonResponse({ success: true, message: "Le message a été supprimé avec succès." });
    } catch (error) {
        logError('adminDeleteMessage', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Récupère les messages envoyés par un responsable.
 * @param {object} data - Contient { responsableId }.
 * @param {object} ctx - Le contexte de la requête.
 */
function responsableGetSentMessages(data, ctx) {
    try {
        const { responsableId } = data;
        if (!responsableId) throw new Error("ID du responsable manquant.");

        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const authorSignature = `Responsable: ${classInfo.responsableName}`;

        const messagesData = _getRawSheetData(SHEET_NAMES.MESSAGES, ctx);
        const headers = messagesData[0];
        const authorIdx = headers.indexOf('AUTEUR_INFO');

        const sentMessages = messagesData.slice(1)
            .filter(row => row[authorIdx] === authorSignature)
            .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])))
            .sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));

        return createJsonResponse({ success: true, data: sentMessages });
    } catch (error) {
        logError('responsableGetSentMessages', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Supprime un message envoyé par un responsable.
 * @param {object} data - Contient { responsableId, messageId }.
 * @param {object} ctx - Le contexte de la requête.
 */
function responsableDeleteMessage(data, ctx) {
    try {
        const { responsableId, messageId } = data;
        if (!responsableId || !messageId) throw new Error("Données de suppression incomplètes.");

        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const authorSignature = `Responsable: ${classInfo.responsableName}`;

        const messagesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MESSAGES);
        const messagesData = messagesSheet.getDataRange().getValues();
        const headers = messagesData[0];
        const msgIdIdx = headers.indexOf('ID_MESSAGE');
        const authorIdx = headers.indexOf('AUTEUR_INFO');

        const rowIndexToDelete = messagesData.findIndex((row, index) => index > 0 && row[msgIdIdx] === messageId);

        if (rowIndexToDelete === -1) throw new Error("Message non trouvé.");
        if (messagesData[rowIndexToDelete][authorIdx] !== authorSignature) {
            throw new Error("Action non autorisée. Vous ne pouvez supprimer que vos propres messages.");
        }

        messagesSheet.deleteRow(rowIndexToDelete + 1);
        return createJsonResponse({ success: true, message: "Le message a été supprimé avec succès." });
    } catch (error) {
        logError('responsableDeleteMessage', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Exporte le rapport de présence détaillé pour un module.
 * @param {object} data - Contient { responsableId, moduleId }.
 */
function responsableExportModuleReport(data, ctx) {
    try {
        const { responsableId, moduleId } = data;
        
        // 1. Récupérer les détails calculés
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId } = classInfo;

        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], row[1]]));
        const moduleName = moduleMap.get(moduleId);
        if (!moduleName) throw new Error("Module non trouvé.");

        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const planningHeaders = planningData[0];
        const courseModuleFkIdx = planningHeaders.indexOf('ID_MODULE_FK');
        const courseStatusIdx = planningHeaders.indexOf('STATUT');
        const totalSessions = planningData.slice(1).filter(row => row[courseModuleFkIdx] === moduleId && row[courseStatusIdx] === 'Confirmé').length;

        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const studentsHeaders = studentsData[0];
        const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
        const studentNameIdx = studentsHeaders.indexOf('NOM_COMPLET');
        const studentClassFkIdx = studentsHeaders.indexOf('ID_CLASSE_FK');
        const studentsInClass = studentsData.slice(1)
            .filter(row => row[studentClassFkIdx] === classId)
            .map(row => ({ id: row[studentIdIdx], name: row[studentNameIdx] }));

        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const scanHeaders = scanData[0];
        const scanStudentIdIdx = scanHeaders.indexOf('ID_ETUDIANT');
        const scanModuleIdx = scanHeaders.indexOf('MODULE');
        const presencesByStudent = scanData.slice(1)
            .filter(row => row[scanModuleIdx] === moduleName)
            .reduce((acc, row) => {
                const studentId = row[scanStudentIdIdx];
                if (studentId) acc[studentId] = (acc[studentId] || 0) + 1;
                return acc;
            }, {});

        const studentStats = studentsInClass.map(student => {
            const presences = presencesByStudent[student.id] || 0;
            const absences = totalSessions - presences;
            return { studentId: student.id, studentName: student.name, presences, absences: Math.max(0, absences) };
        }).sort((a, b) => a.studentName.localeCompare(b.studentName));

        // 2. Générer le CSV
        const headers = ['ID_ETUDIANT', 'NOM_ETUDIANT', 'SEANCES_PRESENT', 'SEANCES_ABSENT', 'TOTAL_SEANCES'];
        const rows = studentStats.map(stat => [stat.studentId, stat.studentName, stat.presences, stat.absences, totalSessions]);
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');

        const fileName = `Rapport_Module_${moduleName.replace(/\s/g, '_')}.csv`;

        return createJsonResponse({ success: true, data: { csvContent, fileName } });
    } catch (error) {
        logError('responsableExportModuleReport', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Génère un rapport d'absences pour la classe d'un responsable sur une période donnée.
 * @param {object} data - Contient { responsableId, startDate, endDate }.
 * @param {object} ctx - Le contexte de la requête.
 */
function responsableExportAbsenceReport(data, ctx) {
    try {
        const { responsableId, startDate, endDate } = data;
        if (!responsableId || !startDate || !endDate) {
            throw new Error("Données de rapport incomplètes.");
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Inclure toute la journée de fin

        // 1. Infos du responsable et de sa classe
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId, className } = classInfo;

        // 2. Récupérer tous les étudiants de la classe
        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const studentsHeaders = studentsData[0];
        const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
        const studentNameIdx = studentsHeaders.indexOf('NOM_COMPLET');
        const studentClassFkIdx = studentsHeaders.indexOf('ID_CLASSE_FK');
        const studentsInClass = studentsData.slice(1)
            .filter(row => row[studentClassFkIdx] === classId)
            .map(row => ({ id: row[studentIdIdx], name: row[studentNameIdx] }));

        // 3. Récupérer tous les cours confirmés pour la classe dans la période donnée
        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const planningHeaders = planningData[0];
        const courseModuleFkIdx = planningHeaders.indexOf('ID_MODULE_FK');
        const courseDateIdx = planningHeaders.indexOf('DATE_COURS');
        const courseStatusIdx = planningHeaders.indexOf('STATUT');

        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], { name: row[1], classId: row[2] }]));
        const scheduledCourses = planningData.slice(1).filter(row => {
            const courseDate = new Date(row[courseDateIdx]);
            const module = moduleMap.get(row[courseModuleFkIdx]);
            return module && module.classId === classId && row[courseStatusIdx] === 'Confirmé' && courseDate >= start && courseDate <= end;
        }).map(row => ({
            date: Utilities.formatDate(new Date(row[courseDateIdx]), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
            module: moduleMap.get(row[courseModuleFkIdx]).name
        }));

        // 4. Récupérer toutes les présences pour la classe dans la période
        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const scanHeaders = scanData[0];
        const scanStudentIdIdx = scanHeaders.indexOf('ID_ETUDIANT');
        const scanDateIdx = scanHeaders.indexOf('DATE_SCAN');
        const scanModuleIdx = scanHeaders.indexOf('MODULE');
        const presentScans = new Set(scanData.slice(1).map(row => `${row[scanStudentIdIdx]}_${row[scanDateIdx]}_${row[scanModuleIdx]}`));

        // 5. Comparer et trouver les absences
        const absenceRecords = [];
        studentsInClass.forEach(student => {
            scheduledCourses.forEach(course => {
                const attendanceKey = `${student.id}_${course.date}_${course.module}`;
                if (!presentScans.has(attendanceKey)) {
                    absenceRecords.push([student.name, student.id, course.date, course.module]);
                }
            });
        });

        // 6. Générer le CSV
        const headers = ['NOM_ETUDIANT', 'ID_ETUDIANT', 'DATE_ABSENCE', 'MODULE_ABSENCE'];
        const csvContent = [headers.join(','), ...absenceRecords.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
        const fileName = `Rapport_Absences_${className.replace(/\s/g, '_')}_${startDate}_au_${endDate}.csv`;

        return createJsonResponse({ success: true, data: { csvContent, fileName } });
    } catch (error) {
        logError('responsableExportAbsenceReport', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Envoie un message de la part d'un responsable à sa classe.
 * @param {object} data - Contient { responsableId, subject, body }.
 * @param {object} ctx - Le contexte de la requête.
 */
function responsableSendMessageToClass(data, ctx) {
    try {
        const { responsableId, subject, body } = data;
        if (!responsableId || !subject || !body) {
            throw new Error("Données de message incomplètes.");
        }

        // 1. Récupérer les infos du responsable (classe, université)
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId, universityId, responsableName } = classInfo;

        // 2. Enregistrer le message dans la base de données
        const messagesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MESSAGES);
        const newId = `MSG-${Utilities.getUuid().substring(0, 6).toUpperCase()}`;
        const timestamp = new Date();
        messagesSheet.appendRow([newId, timestamp, universityId, classId, subject, body, `Responsable: ${responsableName}`]);
        SpreadsheetApp.flush();

        // 3. Récupérer les emails des étudiants de la classe
        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const headers = studentsData[0];
        const studentClassFkIdx = headers.indexOf('ID_CLASSE_FK');
        const emailIdx = headers.indexOf('EMAIL');

        const recipientEmails = studentsData.slice(1)
            .filter(row => row[studentClassFkIdx] === classId && row[emailIdx] && row[emailIdx].includes('@'))
            .map(row => row[emailIdx].trim());

        if (recipientEmails.length === 0) {
            return createJsonResponse({ success: true, message: "Message enregistré. Aucun étudiant avec une adresse e-mail valide trouvé dans cette classe pour l'envoi." });
        }

        // 4. Envoyer l'e-mail
        const emailSubject = `[${classInfo.className}] ${subject}`;
        const emailBody = `Bonjour,\n\nUn message a été envoyé par votre responsable de classe, ${responsableName}:\n\n---\n${body}\n---\n\nCordialement,\nL'équipe ABM EduPilote`;
        MailApp.sendEmail("", emailSubject, emailBody, { bcc: recipientEmails.join(','), name: `Responsable ${classInfo.className}` });

        return createJsonResponse({ success: true, message: `Message envoyé avec succès à ${recipientEmails.length} étudiant(s) de votre classe.` });
    } catch (error) {
        logError('responsableSendMessageToClass', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Enregistre un message pour une classe spécifique ou pour tous.
 * @param {object} data - Contient { universityId, classId ('ALL' pour tous), subject, body }.
 */
function adminSendMessageToClass(data) {
    try {
        const { universityId, classId, subject, body } = data;
        if (!universityId || !classId || !subject || !body) {
            throw new Error("Données de message incomplètes.");
        }

        const messagesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MESSAGES);
        const newId = `MSG-${Utilities.getUuid().substring(0, 6).toUpperCase()}`;
        const timestamp = new Date();
        
        // Pourrait être enrichi avec le nom de l'admin plus tard
        const authorInfo = "Administration"; 

        messagesSheet.appendRow([newId, timestamp, universityId, classId, subject, body, authorInfo]);
        SpreadsheetApp.flush();

        // Invalider les caches de notifications
        cache.removeAll([`notifs_univ_${universityId}_${classId}`, `notifs_univ_${universityId}_ALL`]);

        const target = classId === 'ALL' ? "tous les étudiants" : "la classe sélectionnée";
        return createJsonResponse({ success: true, message: `Message envoyé avec succès à ${target}.` });

    } catch (error) {
        logError('adminSendMessageToClass', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère les notifications pour un utilisateur (étudiant ou responsable).
 * @param {object} data - Contient { studentId } ou { responsableId }.
 */
function getUserNotifications(data, ctx) {
  try {
    const { studentId, responsableId } = data;
    const userId = studentId ? studentId.toUpperCase() : responsableId;
    if (!userId) throw new Error("ID utilisateur manquant.");

    const userInfo = studentId ? getStudentMap()[userId] : getResponsableClassInfo(responsableId, ctx);
    if (!userInfo) throw new Error("Utilisateur non trouvé.");

    const { classId, universityId } = userInfo;
    const cacheKey = `notifs_status_${userId}`; // Utiliser un cache par utilisateur

    // 1. Récupérer les notifications
    const messagesData = _getRawSheetData(SHEET_NAMES.MESSAGES, ctx);
    const headers = messagesData[0];
    const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');
    const classFkIdx = headers.indexOf('ID_CLASSE_FK');
    const msgIdIdx = headers.indexOf('ID_MESSAGE');

    const notifications = messagesData.slice(1)
      .filter(row => row[univFkIdx] === universityId && (row[classFkIdx] === classId || row[classFkIdx] === 'ALL'))
      .map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])))
      .sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));

    // 2. Marquer tous ces messages comme lus pour l'utilisateur
    const readsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MESSAGE_READS);
    const messageIdsToMark = notifications.map(n => n.ID_MESSAGE);
    const existingReadsData = readsSheet.getDataRange().getValues();

    // CORRECTION: Si la feuille est vide ou ne contient que l'en-tête, on ne fait rien.
    const existingReadsSet = new Set(existingReadsData.slice(1).map(row => `${row[0]}_${row[1]}`));

    const newReads = [];
    messageIdsToMark.forEach(msgId => {
      if (!existingReadsSet.has(`${userId}_${msgId}`)) {
        newReads.push([userId, msgId, new Date()]);
      }
    });

    if (newReads.length > 0) {
      readsSheet.getRange(readsSheet.getLastRow() + 1, 1, newReads.length, 3).setValues(newReads);
    }

    // 3. Invalider le cache de statut de notification pour cet utilisateur
    cache.remove(cacheKey);

    return createJsonResponse({ success: true, data: notifications });
  } catch (error) {
    logError('getUserNotifications', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Récupère les modules pour une classe spécifique (pour l'admin).
 * @param {object} data - Contient { classId, universityId }.
 */
function adminGetModulesForClass(data) {
    try {
        const { classId, universityId } = data;
        if (!classId || !universityId) {
            throw new Error("ID de classe ou d'université manquant.");
        }

        const cacheKey = `modules_for_class_${classId}`;
        const modules = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();
            
            // Security check: ensure the class belongs to the university
            const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, ctx);
            const classRow = classesData.slice(1).find(row => row[0] === classId);
            if (!classRow) throw new Error("Classe non trouvée.");
            
            const allowedFiliereIds = new Set(getFiliereIdsForUniversity(universityId));
            if (!allowedFiliereIds.has(classRow[2])) { // classRow[2] is ID_FILIERE_FK
                throw new Error("Accès non autorisé à cette classe.");
            }

            const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
            const headers = modulesData[0];
            const classFkIdx = headers.indexOf('ID_CLASSE_FK');
            return modulesData.slice(1).filter(row => row[classFkIdx] === classId).map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
        }, 300); // Cache for 5 minutes
        return createJsonResponse({ success: true, data: modules });
    } catch (error) {
        logError('adminGetModulesForClass', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère le statut des notifications (nombre de non-lus) pour un utilisateur.
 * @param {object} data - Contient { studentId } ou { responsableId }.
 */
function getUserNotificationStatus(data, ctx) {
    try {
        const { studentId, responsableId } = data;
        const userId = studentId ? studentId.toUpperCase() : responsableId;
        if (!userId) throw new Error("ID utilisateur manquant.");

        const userInfo = studentId ? getStudentMap()[userId] : getResponsableClassInfo(responsableId, ctx);
        if (!userInfo) throw new Error("Utilisateur non trouvé.");

        const cacheKey = `notifs_status_${userId}`;

        const status = getCachedData(cacheKey, () => {
            const messagesData = _getRawSheetData(SHEET_NAMES.MESSAGES, ctx);
            const msgHeaders = messagesData[0];
            const allMessages = messagesData.slice(1).filter(row => row[msgHeaders.indexOf('ID_UNIVERSITE_FK')] === userInfo.universityId && (row[msgHeaders.indexOf('ID_CLASSE_FK')] === userInfo.classId || row[msgHeaders.indexOf('ID_CLASSE_FK')] === 'ALL'));

            const readsData = _getRawSheetData(SHEET_NAMES.MESSAGE_READS, ctx);
            if (readsData.length < 2) return { unreadCount: allMessages.length };

            const readHeaders = readsData[0];
            const readMessagesSet = new Set(readsData.slice(1).filter(row => row[readHeaders.indexOf('ID_UTILISATEUR')] === userId).map(row => row[readHeaders.indexOf('ID_MESSAGE_FK')]));
            const unreadCount = allMessages.filter(row => !readMessagesSet.has(row[msgHeaders.indexOf('ID_MESSAGE')])).length;
            return { unreadCount };
        }, 60);
        return createJsonResponse({ success: true, data: status });
    } catch (error) {
        logError('getUserNotifications', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Envoie une notification par e-mail à tous les étudiants d'une université.
 * @param {object} data - Contient { universityId, subject, body }.
 */
function adminSendNotification(data) {
    try {
        const { universityId, subject, body } = data;
        if (!universityId || !subject || !body) {
            throw new Error("ID Université, sujet et corps du message sont requis.");
        }

        // NOUVEAU: Enregistrer également le message dans la base de données
        adminSendMessageToClass({ universityId, classId: 'ALL', subject, body });

        // 1. Récupérer le nom de l'université pour personnaliser l'e-mail
        const univInfoResponse = getUniversityInfo({ universityId });
        const univInfo = JSON.parse(univInfoResponse.getContent()).data;
        const universityName = univInfo ? univInfo.universityName : "Votre Université";

        // 2. Récupérer tous les étudiants de cette université
        const studentsResponse = getStudentsForAdmin({ universityId });
        const studentsResult = JSON.parse(studentsResponse.getContent());
        if (!studentsResult.success || !studentsResult.data) {
            throw new Error("Impossible de récupérer la liste des étudiants.");
        }
        const students = studentsResult.data;

        // 3. Filtrer pour obtenir une liste d'e-mails uniques et valides
        const emailSet = new Set();
        students.forEach(student => {
            if (student.EMAIL && student.EMAIL.includes('@')) {
                emailSet.add(student.EMAIL.trim());
            }
        });
        const recipientEmails = Array.from(emailSet);

        if (recipientEmails.length === 0) {
            return createJsonResponse({ success: true, message: "Aucun étudiant avec une adresse e-mail valide trouvé. Aucune notification n'a été envoyée." });
        }

        // 4. Envoyer l'e-mail en BCC pour protéger la vie privée et optimiser les quotas
        MailApp.sendEmail("", subject, body, { bcc: recipientEmails.join(','), name: universityName });

        return createJsonResponse({ success: true, message: `Notification envoyée avec succès à ${recipientEmails.length} étudiant(s).` });
    } catch (error) {
        logError('adminSendNotification', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Récupère le nom de l'université pour l'affichage dans l'en-tête admin.
 */
function getUniversityInfo(data) {
    try {
        // CORRECTION: L'ID de l'université est déjà dans les données de la session admin.
        // On le récupère directement depuis l'objet 'data' qui est enrichi par callAdminApi.
        const { universityId } = data;
        if (!universityId) throw new Error("ID Université manquant.");

        const cacheKey = `univ_info_${universityId}`;
        const info = getCachedData(cacheKey, () => {
            const universitiesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.UNIVERSITIES);
            const univData = universitiesSheet.getDataRange().getValues();
            const headers = univData.shift();
            const idIdx = headers.indexOf('ID_UNIVERSITE');
            const nameIdx = headers.indexOf('NOM_UNIVERSITE');

            const univRow = univData.find(row => row[idIdx] === universityId);
            if (!univRow) return null;

            return { universityName: univRow[nameIdx] };
        }, 3600); // Cache pour 1 heure

        if (!info) throw new Error("Université non trouvée.");

        return createJsonResponse({ success: true, data: info });
    } catch (error) {
        logError('getUniversityInfo', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}


/**
 * NOUVEAU : Enregistre une nouvelle école/université et son administrateur.
 */
function registerSchool(data) {
  try {
    const { universityName, adminEmail, adminPassword } = data;
    if (!universityName || !adminEmail || !adminPassword) {
      return createJsonResponse({ success: false, error: 'Toutes les informations sont requises pour créer un compte école.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const adminsSheet = ss.getSheetByName(SHEET_NAMES.ADMINS);
    const universitiesSheet = ss.getSheetByName(SHEET_NAMES.UNIVERSITIES);

    // Vérifier si l'email de l'admin n'est pas déjà pris
    const adminEmails = adminsSheet.getRange(2, 2, adminsSheet.getLastRow(), 1).getValues().flat();
    if (adminEmails.includes(adminEmail)) {
      return createJsonResponse({ success: false, error: 'Cette adresse email est déjà utilisée par un autre administrateur.' });
    }

    // Créer la nouvelle université
    const newUniversityId = `UNIV-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
    universitiesSheet.appendRow([newUniversityId, universityName]);

    // Créer le nouvel administrateur
    const newAdminId = `ADM-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
    const salt = Utilities.getUuid();
    const hashedPassword = hashPassword(adminPassword, salt);
    adminsSheet.appendRow([newAdminId, adminEmail, hashedPassword, salt, newUniversityId]);
    logAction('registerSchool', { universityName, adminEmail });

    return createJsonResponse({ 
        success: true, 
        message: `L'université "${universityName}" a été créée avec succès. Vous allez être redirigé...`,
        token: newUniversityId // Renvoyer le token pour une connexion automatique
    });
  } catch (error) {
    logError('registerSchool', error);
    return createJsonResponse({ success: false, error: `Erreur lors de la création de l'école: ${error.message}` });
  }
}

/**
 * NOUVEAU : Connecte un administrateur d'école.
 */
function loginSchool(data) {
  try {
    const { email, password } = data;
    if (!email || !password) {
      return createJsonResponse({ success: false, error: 'Email et mot de passe requis.' });
    }

    const adminsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ADMINS);
    const adminsData = adminsSheet.getDataRange().getValues();
    const headers = adminsData.shift();
    const emailIdx = headers.indexOf('EMAIL_ADMIN');
    const hashIdx = headers.indexOf('PASSWORD_HASH');
    const saltIdx = headers.indexOf('SALT');
    const univIdIdx = headers.indexOf('ID_UNIVERSITE_FK');

    for (const row of adminsData) {
      // Vérifier le mot de passe haché
      if (row[emailIdx] === email && verifyPassword(password, row[hashIdx], row[saltIdx])) {        
        logAction('loginSchool', { email, success: true });
        return createJsonResponse({ success: true, message: 'Connexion réussie.', token: row[univIdIdx] });
      }
    }
    return createJsonResponse({ success: false, error: 'Email ou mot de passe incorrect.' });
  } catch (error) {
    logError('loginSchool', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}
/**
 * NOUVEAU : Récupère la liste des entités (universités, filières, classes).
 */
function getEntitiesForAdmin(data) {
    try {
        const { entityType, universityId } = data;
        if (!universityId) {
            return createJsonResponse({ success: false, error: "Session administrateur invalide." });
        }

        // Utilisation du cache pour accélérer la récupération
        const cacheKey = `entities_${entityType}_${universityId}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return createJsonResponse({ success: true, data: JSON.parse(cached) });
        }

        const sheetName = getSheetNameForEntity(entityType);
        const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
        if (!sheet) throw new Error(`L'entité '${entityType}' est inconnue.`);

        const values = sheet.getDataRange().getValues();
        const headers = values.shift() || [];
        
        let filteredValues = values;
        if (entityType === 'filiere') {
            const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');
            filteredValues = values.filter(row => row[univFkIdx] === universityId);
        } else if (entityType === 'classe') {
            const allowedFiliereIds = getFiliereIdsForUniversity(universityId);
            const classeFkIdx = headers.indexOf('ID_FILIERE_FK');
            filteredValues = values.filter(row => allowedFiliereIds.includes(row[classeFkIdx]));
        }

        const entities = filteredValues.map(row => {
            const entity = {};
            headers.forEach((header, i) => entity[header] = row[i]);
            return entity;
        });

        cache.put(cacheKey, JSON.stringify(entities), 300); // Cache pour 5 minutes
        return createJsonResponse({ success: true, data: entities });

    } catch (error) {
        logError('adminGetEntities', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère les détails d'une classe pour la page d'inscription.
 */
function getClassDetails(data) {
  const { classId } = data;
  if (!classId) {
    return createJsonResponse({ success: false, error: "ID de classe manquant." });
  }

  const cacheKey = `class_details_${classId}`;
  
  try {
    // La fonction getCachedData va chercher dans le cache, ou exécuter le code si l'info n'y est pas.
    const details = getCachedData(cacheKey, () => {
      // Cette partie du code ne s'exécute que si l'information n'est pas dans le cache.
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
      const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);
      const universitiesSheet = ss.getSheetByName(SHEET_NAMES.UNIVERSITIES);

      // 1. Find Class
      const classesData = classesSheet.getDataRange().getValues();
      const classesHeaders = classesData.shift();
      const classIdIdx = classesHeaders.indexOf('ID_CLASSE');
      const classNameIdx = classesHeaders.indexOf('NOM_CLASSE');
      const classFiliereFkIdx = classesHeaders.indexOf('ID_FILIERE_FK');
      
      const classRow = classesData.find(row => row[classIdIdx] === classId);
      if (!classRow) throw new Error("Classe non trouvée.");
      const className = classRow[classNameIdx];
      const filiereId = classRow[classFiliereFkIdx];

      // 2. Find Filiere
      const filieresData = filieresSheet.getDataRange().getValues();
      const filieresHeaders = filieresData.shift();
      const filiereIdIdx = filieresHeaders.indexOf('ID_FILIERE');
      const filiereNameIdx = filieresHeaders.indexOf('NOM_FILIERE');
      const filiereUnivFkIdx = filieresHeaders.indexOf('ID_UNIVERSITE_FK');

      const filiereRow = filieresData.find(row => row[filiereIdIdx] === filiereId);
      if (!filiereRow) throw new Error("Filière associée non trouvée.");
      const filiereName = filiereRow[filiereNameIdx];
      const universityId = filiereRow[filiereUnivFkIdx];

      // 3. Find University
      const universitiesData = universitiesSheet.getDataRange().getValues();
      const universitiesHeaders = universitiesData.shift();
      const univIdIdx = universitiesHeaders.indexOf('ID_UNIVERSITE');
      const univNameIdx = universitiesHeaders.indexOf('NOM_UNIVERSITE');

      const universityRow = universitiesData.find(row => row[univIdIdx] === universityId);
      if (!universityRow) throw new Error("Université associée non trouvée.");
      
      return { className: className, filiereName: filiereName, universityName: universityRow[univNameIdx] };
    }, 3600); // Cache pour 1 heure, les détails de classe changent peu.

    return createJsonResponse({ success: true, data: details });

  } catch (error) {
    logError('getClassDetails', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Inscrit un nouvel étudiant et l'assigne à une classe.
 */
function registerStudentInClass(data) {
  try {
    const { name, studentId, email, telephone, classId } = data;
    if (!name || !studentId || !email || !classId) {
      return createJsonResponse({ success: false, error: "Toutes les informations (Nom, ID Étudiant, Email) sont requises." });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
    const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
    const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);

    // --- OPTIMISATION : Utiliser des Sets pour une vérification quasi-instantanée ---
    const studentsData = studentsSheet.getDataRange().getValues();
    const studentsHeaders = studentsData.shift();
    const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
    const emailIdx = studentsHeaders.indexOf('EMAIL');

    const existingIds = new Set(studentsData.map(row => row[studentIdIdx] ? row[studentIdIdx].toString().trim().toUpperCase() : ''));
    const existingEmails = new Set(studentsData.map(row => row[emailIdx] ? row[emailIdx].toString().trim().toLowerCase() : ''));

    if (existingIds.has(studentId.trim().toUpperCase())) {
      return createJsonResponse({ success: false, error: `Cet ID Étudiant (${studentId}) est déjà utilisé.` });
    }
    if (existingEmails.has(email.trim().toLowerCase())) {
      return createJsonResponse({ success: false, error: `Cette adresse email (${email}) est déjà utilisée.` });
    }
    // --- FIN OPTIMISATION ---

    // 2. Trouver les informations de la classe (filiereId, universityId)
    const classesData = classesSheet.getDataRange().getValues();
    const classesHeaders = classesData.shift();
    const classIdIdx_c = classesHeaders.indexOf('ID_CLASSE');
    const filiereFkIdx_c = classesHeaders.indexOf('ID_FILIERE_FK');
    const classRow = classesData.find(row => row[classIdIdx_c] === classId);
    if (!classId) {
      return createJsonResponse({ success: false, error: "La classe spécifiée est invalide." });
    }
    const filiereId = classRow[filiereFkIdx_c];

    const filieresData = filieresSheet.getDataRange().getValues();
    const filieresHeaders = filieresData.shift();
    const filiereIdIdx = filieresHeaders.indexOf('ID_FILIERE');
    const filiereUnivFkIdx = filieresHeaders.indexOf('ID_UNIVERSITE_FK');
    const filiereRow = filieresData.find(row => row[filiereIdIdx] === filiereId);
    if (!filiereRow) {
        return createJsonResponse({ success: false, error: "La filière associée à cette classe est introuvable." });
    }
    const universityId = filiereRow[filiereUnivFkIdx];

    // 3. Ajouter le nouvel étudiant
    const newStudentRow = [ studentId.trim().toUpperCase(), name.trim(), filiereId, classId, email.trim().toLowerCase(), telephone || '', universityId, new Date() ];
    studentsSheet.appendRow(newStudentRow);

    // 4. Invalider le cache des étudiants pour qu'il soit rafraîchi à la prochaine lecture
    clearStudentCache();

    logAction('registerStudentInClass', { studentId, classId });
    return createJsonResponse({ success: true, message: `Bienvenue, ${name} ! Vous êtes maintenant inscrit(e).` });

  } catch (error) {
    logError('registerStudentInClass', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}

/**
 * NOUVEAU : Enregistre une demande de réinitialisation de mot de passe.
 */
function requestPasswordReset(data) {
  try {
    const { email } = data;
    if (!email) {
      return createJsonResponse({ success: false, error: 'Veuillez fournir une adresse email.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const adminsSheet = ss.getSheetByName(SHEET_NAMES.ADMINS);
    const resetsSheet = ss.getSheetByName(SHEET_NAMES.PASSWORD_RESETS);

    // Vérifier si l'admin existe
    const adminEmails = adminsSheet.getRange(2, 2, adminsSheet.getLastRow(), 1).getValues().flat();
    if (!adminEmails.includes(email)) {
      // On renvoie un message générique pour ne pas révéler si un email existe ou non.
      return createJsonResponse({ success: true, message: "Si cette adresse email est associée à un compte, une demande de réinitialisation a été envoyée. Un administrateur vous contactera." });
    }

    // Enregistrer la demande
    resetsSheet.appendRow([new Date(), email, 'EN ATTENTE']);

    logAction('requestPasswordReset', { email });
    return createJsonResponse({ success: true, message: "Votre demande a été reçue. Un administrateur vous contactera dans les plus brefs délais pour procéder à la réinitialisation." });

  } catch (error) {
    logError('requestPasswordReset', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}

/**
 * NOUVEAU : Ajoute une nouvelle entité.
 */
function addEntityForAdmin(data) {
  try {
    const { entityType, payload, universityId } = data;
    if (!entityType || !payload || !payload.name) {
      return createJsonResponse({ success: false, error: 'Données invalides. Le nom est obligatoire.' });
    }
    const sheetName = getSheetNameForEntity(entityType);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) {
      return createJsonResponse({ success: false, error: `L'entité '${entityType}' est inconnue.` });
    }
    
    const newId = `${entityType.substring(0, 3).toUpperCase()}-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
    
    let rowData;
    if (entityType === 'filiere') {
        if (!universityId) return createJsonResponse({ success: false, error: 'ID Université manquant pour lier la filière.' });
        rowData = [newId, payload.name, universityId, new Date()]; // NOUVEAU: Ajout de la date de création
    } else if (entityType === 'classe') {
        if (!payload.filiereId) return createJsonResponse({ success: false, error: 'ID Filière manquant.' });
        rowData = [newId, payload.name, payload.filiereId];
    } else if (entityType === 'module') {
        if (!payload.classeId || !payload.enseignant) {
            return createJsonResponse({ success: false, error: 'Classe et enseignant sont requis pour créer un module.' });
        }
        rowData = [newId, payload.name, payload.classeId, universityId, payload.enseignant, 'En cours'];
    } else {
        throw new Error('Type d\'entité non géré pour l\'ajout.');
    }
    sheet.appendRow(rowData);

    // CORRECTION: Forcer l'application de l'écriture avant de continuer.
    // Cela garantit que la nouvelle ligne est bien enregistrée avant d'invalider le cache.
    SpreadsheetApp.flush();
    // Invalider les caches pertinents après un ajout
    clearAllCachesForUniversity(universityId, [entityType, 'dashboard']);
    logAction('adminAddEntity', { entityType, name: payload.name, universityId });

    return createJsonResponse({ success: true, message: `"${payload.name}" a été ajouté avec succès.` });
  } catch (error) {
    logError('adminAddEntity', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Ajoute plusieurs entités en une seule fois (création en masse).
 */
function adminBulkAddEntities(data) {
  try {
    const { entityType, payload, universityId } = data;
    if (!entityType || !payload || !Array.isArray(payload) || payload.length === 0) {
      throw new Error("Données pour l'ajout en masse invalides.");
    }

    const sheetName = getSheetNameForEntity(entityType);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error(`L'entité '${entityType}' est inconnue.`);

    const rowsToAdd = [];
    payload.forEach(item => {
      const newId = `${entityType.substring(0, 3).toUpperCase()}-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
      let newRow;
      if (entityType === 'classe') {
        if (!item.parentId) throw new Error("ID de la filière parente manquant pour une classe.");
        newRow = [newId, item.name, item.parentId];
      } else if (entityType === 'module') {
        if (!item.parentId || !item.enseignant) throw new Error("ID de la classe et nom de l'enseignant requis pour un module.");
        newRow = [newId, item.name, item.parentId, universityId, item.enseignant, 'En cours'];
      } else {
        return; // Ne rien faire pour les types non supportés en masse
      }
      rowsToAdd.push(newRow);
    });

    if (rowsToAdd.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
      SpreadsheetApp.flush();
      clearAllCachesForUniversity(universityId, [entityType, 'dashboard']);
      logAction('adminBulkAddEntities', { entityType, count: rowsToAdd.length, universityId });
    }

    return createJsonResponse({ success: true, message: `${rowsToAdd.length} ${entityType}(s) ajouté(s) avec succès.` });
  } catch (error) {
    logError('adminBulkAddEntities', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}
/**
 * NOUVEAU: Fonction interne pour trouver l'historique de présence d'un étudiant.
 * Cette fonction est réutilisable et peut être appelée par d'autres fonctions du backend.
 * @param {string} studentId - L'ID de l'étudiant à rechercher.
 * @returns {Array} Un tableau d'objets représentant les enregistrements de présence.
 */
function findStudentAttendance(studentId) {
    if (!studentId) return []; // Retourne un tableau vide si aucun ID n'est fourni

    const scanSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
    const scanData = scanSheet.getDataRange().getValues();
    const headers = scanData.shift();
    const studentIdIdx = headers.indexOf('ID_ETUDIANT');

    if (studentIdIdx === -1) {
        logError('findStudentAttendance', new Error('La colonne ID_ETUDIANT est introuvable dans l\'onglet SCAN.'));
        return []; // Retourne un tableau vide en cas d'erreur de configuration
    }

    return scanData
        .filter(row => row[studentIdIdx] && row[studentIdIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase())
        .map(row => {
            const record = {};
            headers.forEach((header, i) => record[header] = row[i]);
            return record;
        }).sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP)); // Trier par date la plus récente en premier
}
/**
 * NOUVEAU : Récupère le planning pour une université.
 */
function getPlanningForAdmin(data) {
    const { universityId } = data;
    if (!universityId) return createJsonResponse({ success: false, error: "Session administrateur invalide." });

    const cacheKey = `planning_${universityId}`;
    try {
        // Utilisation du cache pour accélérer la récupération du planning
        const planning = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();
            
            // 1. Créer des maps pour une recherche rapide
            const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
            const moduleMap = new Map(modulesData.slice(1).map(row => [row[0], { name: row[1], classId: row[2], teacher: row[4] }])); // ID_MODULE -> {name, classId, teacher}
            
            const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, ctx);
            const classMap = new Map(classesData.slice(1).map(row => [row[0], { name: row[1], filiereId: row[2] }])); // ID_CLASSE -> {name, filiereId}

            const allowedFiliereIds = new Set(getFiliereIdsForUniversity(universityId));

            // 2. Filtrer le planning
            const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
            const planningHeaders = planningData.shift();
            const moduleIdFkIdx = planningHeaders.indexOf('ID_MODULE_FK');

            return planningData.map(row => {
                const course = {};
                planningHeaders.forEach((header, i) => course[header] = row[i]);
                
                const moduleInfo = moduleMap.get(course.ID_MODULE_FK);
                if (!moduleInfo) return null; // Si le module n'existe pas, on ignore le cours
                
                const classInfo = classMap.get(moduleInfo.classId);
                if (!classInfo || !allowedFiliereIds.has(classInfo.filiereId)) return null; // Si la classe n'appartient pas à l'université, on ignore

                // Enrichir l'objet cours avec les informations lisibles
                course.CLASSE = classInfo.name;
                course.MODULE = moduleInfo.name;
                course.ENSEIGNANT = moduleInfo.teacher;
                return course;
            }).filter(Boolean) // Enlever les cours nuls (ceux qui ont été ignorés)
              .sort((a, b) => new Date(b.DATE_COURS) - new Date(a.DATE_COURS));
        }, 180); // Cache de 3 minutes pour le planning

        return createJsonResponse({ success: true, data: planning });

    } catch (error) {
        logError('adminGetPlanning', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU : Ajoute un cours au planning.
 */
function addCourseForAdmin(data) {
    try {
        const { payload, universityId } = data;
        const { moduleId, date, startTime, endTime } = payload; // NOUVEAU: Utilise moduleId
        const newId = `CRS-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
        const newCourseRow = [newId, moduleId, new Date(date), startTime, endTime, 'Confirmé'];
        SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PLANNING).appendRow(newCourseRow);
        
        // Invalider les caches pertinents après ajout
        clearAllCachesForUniversity(universityId, ['planning', 'dashboard']);
        logAction('adminAddCourse', { moduleId, universityId });

        return createJsonResponse({ success: true, message: `Le cours a été ajouté au planning.` });
    } catch (error) {
        logError('adminAddCourse', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU : Supprime un cours du planning.
 */
function deleteCourseForAdmin(data) {
    try {
        const { courseId, universityId } = data;
        if (!courseId || !universityId) {
            return createJsonResponse({ success: false, error: "ID du cours ou de l'université manquant." });
        }

        const planningSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PLANNING);
        const planningData = planningSheet.getDataRange().getValues();
        const headers = planningData[0];
        const idIdx = headers.indexOf('ID_COURS');
        const moduleIdFkIdx = headers.indexOf('ID_MODULE_FK'); // NOUVEAU

        // Find the row index to delete
        const rowIndexToDelete = planningData.findIndex((row, index) => index > 0 && row[idIdx] === courseId);

        if (rowIndexToDelete === -1) {
            throw new Error("Cours non trouvé.");
        }
        
        // NOUVEAU: Security check: Does this course belong to the admin's university?
        const courseModuleId = planningData[rowIndexToDelete + 1][moduleIdFkIdx]; // +1 because planningData is shifted
        const ctx = createRequestContext();
        const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
        const moduleHeaders = modulesData[0];
        const modIdIdx = moduleHeaders.indexOf('ID_MODULE');
        const modUnivFkIdx = moduleHeaders.indexOf('ID_UNIVERSITE_FK');
        const moduleRow = modulesData.slice(1).find(row => row[modIdIdx] === courseModuleId);

        if (!moduleRow || moduleRow[modUnivFkIdx] !== universityId) {
            throw new Error("Vous n'êtes pas autorisé à supprimer ce cours.");
        }

        // // Check if the class associated with the module belongs to an allowed filiere (redundant if moduleUnivFkIdx is checked)
        // const classId = moduleRow[modClassFkIdx];
        // const classInfo = _getRawSheetData(SHEET_NAMES.CLASSES, ctx).slice(1).find(row => row[0] === classId);
        // if (!classInfo || !getFiliereIdsForUniversity(universityId).includes(classInfo[2])) { // classInfo[2] is ID_FILIERE_FK
        //     throw new Error("Vous n'êtes pas autorisé à supprimer ce cours.");
        // }

            planningSheet.deleteRow(rowIndexToDelete + 1);
            
            // Invalider les caches pertinents après suppression
            clearAllCachesForUniversity(universityId, ['planning', 'dashboard']);
            logAction('adminDeleteCourse', { courseId, universityId });

            return createJsonResponse({ success: true, message: "Le cours a été supprimé avec succès." });
    } catch (error) {
        logError('adminDeleteCourse', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: ACTION: responsableGetLastConfirmedCourse
 * Récupère le dernier cours confirmé pour la classe d'un responsable.
 * @param {object} data - Contient { responsableId }.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {object} JSON response avec les données du cours.
 */
function responsableGetLastConfirmedCourse(data, ctx) {
    try {
        const { responsableId } = data;
        if (!responsableId) throw new Error("ID du responsable manquant.");

        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId } = classInfo;

        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], { name: row[1], classId: row[2] }]));
        
        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const planningHeaders = planningData[0];

        const courses = planningData.slice(1).filter(row => {
            const module = moduleMap.get(row[planningHeaders.indexOf('ID_MODULE_FK')]);
            return module && module.classId === classId && row[planningHeaders.indexOf('STATUT')] === 'Confirmé';
        }).map(row => {
            const course = Object.fromEntries(planningHeaders.map((h, i) => [h, row[i]]));
            course.NOM_MODULE = moduleMap.get(course.ID_MODULE_FK).name;
            return course;
        }).sort((a, b) => {
            // Combinaison de la date et de l'heure de début pour un tri précis
            const dateA = new Date(a.DATE_COURS);
            const dateB = new Date(b.DATE_COURS);
            // Les heures sont déjà des objets Date, on peut les comparer directement
            return (dateB.getTime() + b.HEURE_DEBUT.getTime()) - (dateA.getTime() + a.HEURE_DEBUT.getTime());
        });

        if (courses.length === 0) {
            throw new Error("Aucun cours confirmé n'a été trouvé pour votre classe.");
        }

        return createJsonResponse({ success: true, data: { course: courses[0] } });

    } catch (error) {
        logError('responsableGetLastConfirmedCourse', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: ACTION: responsableGetStudentsForOnlineAttendance
 * Récupère les étudiants d'une classe et ceux déjà présents pour un cours donné.
 * @param {object} data - Contient { responsableId, courseId }.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {object} JSON response avec { students, attendees }.
 */
function responsableGetStudentsForOnlineAttendance(data, ctx) {
    try {
        const { responsableId, courseId } = data;
        if (!responsableId || !courseId) {
            throw new Error("ID du responsable et du cours sont requis.");
        }

        // 1. Vérification de sécurité et récupération des informations
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId } = classInfo;

        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const planningHeaders = planningData[0];
        const p_courseIdIdx = planningHeaders.indexOf('ID_COURS');
        const p_moduleIdFkIdx = planningHeaders.indexOf('ID_MODULE_FK');
        const courseRow = planningData.slice(1).find(row => row[p_courseIdIdx] === courseId);
        if (!courseRow) throw new Error("Cours non trouvé.");

        const moduleId = courseRow[p_moduleIdFkIdx];
        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], { name: row[1], classId: row[2] }]));
        const moduleInfo = moduleMap.get(moduleId);

        if (!moduleInfo || moduleInfo.classId !== classId) {
            throw new Error("Action non autorisée. Ce cours n'appartient pas à votre classe.");
        }
        const moduleName = moduleInfo.name;

        // 2. Récupérer tous les étudiants de la classe
        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const studentsHeaders = studentsData[0];
        const s_idIdx = studentsHeaders.indexOf('ID_ETUDIANT');
        const s_nameIdx = studentsHeaders.indexOf('NOM_COMPLET');
        const s_classFkIdx = studentsHeaders.indexOf('ID_CLASSE_FK');
        const students = studentsData.slice(1)
            .filter(row => row[s_classFkIdx] === classId)
            .map(row => ({ ID_ETUDIANT: row[s_idIdx], NOM_COMPLET: row[s_nameIdx] }))
            .sort((a, b) => a.NOM_COMPLET.localeCompare(b.NOM_COMPLET));

        // 3. Récupérer les présences déjà enregistrées pour ce cours aujourd'hui
        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const scanHeaders = scanData[0];
        const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
        const attendees = new Set(
            scanData.slice(1)
            .filter(row => row[scanHeaders.indexOf('MODULE')] === moduleName && row[scanHeaders.indexOf('DATE_SCAN')] === todayStr)
            .map(row => row[scanHeaders.indexOf('ID_ETUDIANT')])
        );

        return createJsonResponse({ success: true, data: { students, attendees: Array.from(attendees) } });

    } catch (error) {
        logError('responsableGetStudentsForOnlineAttendance', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Supprime une entité (filière, classe, responsable).
 */
function adminDeleteEntity(data) {
    try {
        const { entityType, entityId, universityId } = data;
        if (!entityType || !entityId || !universityId) {
            throw new Error("Données de suppression invalides.");
        }

        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetName = getSheetNameForEntity(entityType);
        const sheet = ss.getSheetByName(sheetName);
        const dataRange = sheet.getDataRange();
        const values = dataRange.getValues();
        const headers = values[0];
        const idColIdx = headers.indexOf(`ID_${entityType.toUpperCase()}`);
        
        const rowIndexToDelete = values.findIndex((row, index) => index > 0 && row[idColIdx] === entityId);

        if (rowIndexToDelete === -1) {
            throw new Error("Entité non trouvée.");
        }

        // Vérifications de dépendance avant suppression
        if (entityType === 'filiere') {
            const ctx = createRequestContext(); // OPTIMISATION
            const { cascade } = data; // NOUVEAU: Récupérer l'option de cascade
            const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, ctx);
            const classesHeaders = classesData[0];
            const classIdIdx_c = classesHeaders.indexOf('ID_CLASSE');
            const filiereFkIdx_c = classesHeaders.indexOf('ID_FILIERE_FK');
            
            const classesToDelete = classesData.slice(1).filter(row => row[filiereFkIdx_c] === entityId);

            if (classesToDelete.length > 0) {
                if (cascade) {
                    // Suppression en cascade des classes et de leurs responsables
                    const classIdsToDelete = classesToDelete.map(c => c[classIdIdx_c]);
                    classIdsToDelete.forEach(classId => {
                        // On simule une suppression d'entité pour chaque classe et responsable
                        adminDeleteEntity({ entityType: 'classe', entityId: classId, universityId, cascade: true });
                    });
                } else {
                    // Comportement par défaut: refuser la suppression et demander confirmation
                    throw new Error(`Impossible de supprimer. ${classesToDelete.length} classe(s) sont rattachées à cette filière. Voulez-vous tout supprimer ?`);
                }
            }
        } else if (entityType === 'classe') {
            const ctx = createRequestContext(); // OPTIMISATION
            const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
            const studentClassFkIdx = studentsData[0].indexOf('ID_CLASSE_FK');
            if (studentClassFkIdx !== -1 && studentsData.slice(1).some(row => row[studentClassFkIdx] === entityId)) {
                throw new Error("Impossible de supprimer cette classe car des étudiants y sont inscrits.");
            }
            const respData = _getRawSheetData(SHEET_NAMES.RESPONSABLES, ctx);
            const respClassFkIdx = respData[0].indexOf('ID_CLASSE_FK');
            if (respClassFkIdx !== -1 && respData.slice(1).some(row => row[respClassFkIdx] === entityId)) {
                throw new Error("Impossible de supprimer cette classe car un responsable y est assigné.");
            }
        }

        sheet.deleteRow(rowIndexToDelete + 1); // +1 car findIndex est 0-based et les données n'incluent pas l'en-tête

        // Invalider les caches pertinents après une suppression
        clearAllCachesForUniversity(universityId, [entityType, 'dashboard']);
        logAction('adminDeleteEntity', { entityType, entityId, universityId });

        return createJsonResponse({ success: true, message: `L'entité a été supprimée avec succès.` });

    } catch (error) {
        logError('adminDeleteEntity', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère les statistiques de présence pour l'admin sous forme de données pour graphiques.
 * @param {object} data - Contient { universityId }.
 */
function adminGetAttendanceStats(data) {
    try {
        const { universityId } = data;
        if (!universityId) throw new Error("ID Université manquant.");

        const cacheKey = `attendance_stats_${universityId}`;
        const stats = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();

            // 1. Get all classes for the university
            const allowedFiliereIds = getFiliereIdsForUniversity(universityId);
            const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, ctx);
            const classesHeaders = classesData[0];
            const classIdIdx = classesHeaders.indexOf('ID_CLASSE');
            const classNameIdx = classesHeaders.indexOf('NOM_CLASSE');
            const classFiliereFkIdx = classesHeaders.indexOf('ID_FILIERE_FK');
            const universityClasses = classesData.slice(1)
                .filter(row => allowedFiliereIds.includes(row[classFiliereFkIdx]))
                .map(row => ({ id: row[classIdIdx], name: row[classNameIdx] }));

            // 2. Get all students and group by class
            const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
            const studentClassFkIdx = studentsData[0].indexOf('ID_CLASSE_FK');
            const studentUnivFkIdx = studentsData[0].indexOf('ID_UNIVERSITE_FK');
            const studentsByClass = studentsData.slice(1)
                .filter(row => row[studentUnivFkIdx] === universityId)
                .reduce((acc, row) => {
                    const classId = row[studentClassFkIdx];
                    if (classId) acc[classId] = (acc[classId] || 0) + 1;
                    return acc;
                }, {});

            // NOUVEAU: Compter les cours confirmés par classe
            const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
            const moduleMapForPlanning = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], row[2]])); // Map ID_MODULE -> ID_CLASSE_FK
            const confirmedCoursesByClass = planningData.slice(1).reduce((acc, row) => {
                const status = row[5]; // STATUT
                const classId = moduleMapForPlanning.get(row[1]); // ID_MODULE_FK
                if (status === 'Confirmé' && classId) {
                    acc[classId] = (acc[classId] || 0) + 1;
                }
                return acc;
            }, {});

            // 3. Get all attendance records for the university's students
            const studentIdsForUniv = new Set(studentsData.slice(1).filter(r => r[studentUnivFkIdx] === universityId).map(r => r[studentsData[0].indexOf('ID_ETUDIANT')]));
            const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
            const scanHeaders = scanData[0];
            const scanStudentIdIdx = scanHeaders.indexOf('ID_ETUDIANT');
            // CORRECTION: La colonne MODULE n'était pas récupérée ici
            const scanModuleIdx = scanHeaders.indexOf('MODULE');
            const scanClassIdx = scanHeaders.indexOf('CLASSE');
            const scanDateIdx = scanHeaders.indexOf('DATE_SCAN');

            const attendanceByClass = {};
            const attendanceOverTime = {};
            const attendanceByModule = {}; // NOUVEAU

            scanData.slice(1).forEach(row => {
                const studentId = row[scanStudentIdIdx];
                if (studentIdsForUniv.has(studentId)) {
                    const className = row[scanClassIdx];
                    const scanDate = row[scanDateIdx] instanceof Date ? Utilities.formatDate(row[scanDateIdx], Session.getScriptTimeZone(), 'yyyy-MM-dd') : row[scanDateIdx];

                    const moduleName = row[scanModuleIdx]; // NOUVEAU
                    // Aggregate by class
                    if (className) {
                        if (!attendanceByClass[className]) attendanceByClass[className] = { totalScans: 0, presentStudents: new Set() };
                        attendanceByClass[className].totalScans++;
                        attendanceByClass[className].presentStudents.add(studentId);
                    }

                    // Aggregate by date
                    if (scanDate) {
                        attendanceOverTime[scanDate] = (attendanceOverTime[scanDate] || 0) + 1;
                    }

                    // NOUVEAU: Aggregate by module
                    if (moduleName) {
                        if (!attendanceByModule[moduleName]) attendanceByModule[moduleName] = new Set();
                        attendanceByModule[moduleName].add(studentId);
                    }
                }
            });

            // 4. Format the final data structure
            const byClass = universityClasses.map(c => {
                const totalStudents = studentsByClass[c.id] || 0;
                const totalConfirmedCourses = confirmedCoursesByClass[c.id] || 0;
                const totalPossiblePresences = totalStudents * totalConfirmedCourses;
                const totalActualPresences = (attendanceByClass[c.name] && attendanceByClass[c.name].totalScans) || 0;
                
                let absenceRate = 0;
                if (totalPossiblePresences > 0) {
                    const totalAbsences = totalPossiblePresences - totalActualPresences;
                    absenceRate = Math.max(0, (totalAbsences / totalPossiblePresences) * 100);
                }

                return {
                    className: c.name,
                    totalStudents: totalStudents,
                    uniquePresentStudents: (attendanceByClass[c.name] && attendanceByClass[c.name].presentStudents.size) || 0,
                    absenceRate: parseFloat(absenceRate.toFixed(1)) // NOUVEAU: Taux d'absence
                };
            });

            // NOUVEAU: Formater les données pour le graphique des modules
            const byModule = Object.entries(attendanceByModule)
                .map(([moduleName, studentSet]) => ({
                    moduleName,
                    uniqueAttendees: studentSet.size
                }))
                .sort((a, b) => b.uniqueAttendees - a.uniqueAttendees) // Trier par les plus fréquentés
                .slice(0, 5); // Ne garder que le top 5

            // NOUVEAU: Calculer le statut des modules
            const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
            const modUnivFkIdx = modulesData[0].indexOf('ID_UNIVERSITE_FK');
            const modStatusIdx = modulesData[0].indexOf('STATUT');
            const moduleStatus = modulesData.slice(1)
                .filter(row => row[modUnivFkIdx] === universityId)
                .reduce((acc, row) => {
                    const status = row[modStatusIdx] || 'Indéfini';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                }, {});

            // NOUVEAU: Calculer l'évolution des inscriptions
            const studentInscriptionDateIdx = studentsData[0].indexOf('DATE_INSCRIPTION');
            const inscriptionTrend = studentsData.slice(1)
                .filter(row => row[studentUnivFkIdx] === universityId && row[studentInscriptionDateIdx])
                .reduce((acc, row) => {
                    const inscriptionDate = new Date(row[studentInscriptionDateIdx]);
                    // Formater en 'YYYY-MM' pour regrouper par mois
                    const monthKey = Utilities.formatDate(inscriptionDate, Session.getScriptTimeZone(), 'yyyy-MM');
                    acc[monthKey] = (acc[monthKey] || 0) + 1;
                    return acc;
                }, {});

            return { byClass, attendanceOverTime, byModule, moduleStatus, inscriptionTrend};
        }, 300); // Cache de 5 minutes

        return createJsonResponse({ success: true, data: stats });
    } catch (error) {
        logError('adminGetAttendanceStats', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Récupère la liste des étudiants pour un admin.
 */
function getStudentsForAdmin(data) {
    const { universityId } = data;
    if (!universityId) return createJsonResponse({ success: false, error: "Session administrateur invalide." });

    const cacheKey = `students_${universityId}`;
    try {
        const students = getCachedData(cacheKey, () => {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
            const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
            const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);

            const classMap = Object.fromEntries(classesSheet.getDataRange().getValues().slice(1).map(row => [row[0], row[1]]));
            const filiereMap = Object.fromEntries(filieresSheet.getDataRange().getValues().slice(1).map(row => [row[0], row[1]]));

            const studentsData = studentsSheet.getDataRange().getValues();
            const headers = studentsData.shift();
            const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');

            return studentsData
                .filter(row => row[univFkIdx] === universityId)
                .map(row => {
                    const student = {};
                    headers.forEach((header, i) => student[header] = row[i]);
                    student.NOM_CLASSE = classMap[student.ID_CLASSE_FK] || 'Non assigné';
                    student.NOM_FILIERE = filiereMap[student.ID_FILIERE_FK] || 'Non assigné';
                    return student;
                });
        }, 300); // Cache de 5 minutes

        return createJsonResponse({ success: true, data: students });
    } catch (error) {
        logError('getStudentsForAdmin', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU : Ajoute un responsable de classe.
 */
function addResponsableForAdmin(data) {
    try {
        const { payload, universityId } = data;
        const { name, email, password, classId } = payload;

        if (!name || !email || !password || !classId) {
            return createJsonResponse({ success: false, error: "Nom, email, mot de passe et classe assignée sont requis." });
        }

        const responsablesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESPONSABLES);
        const responsablesData = responsablesSheet.getDataRange().getValues();
        const emailIdx = responsablesData[0].indexOf('EMAIL_RESPONSABLE');
        const classFkIdx = responsablesData[0].indexOf('ID_CLASSE_FK');

        // Vérifier si l'email ou la classe n'est pas déjà pris
        for (let i = 1; i < responsablesData.length; i++) {
            if (responsablesData[i][emailIdx] === email) {
                throw new Error(`L'email ${email} est déjà utilisé par un autre responsable.`);
            }
        }

        const salt = Utilities.getUuid();
        const hashedPassword = hashPassword(password, salt);
        const newId = `RESP-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
        const newResponsableRow = [newId, name, email, hashedPassword, salt, classId, universityId];
        responsablesSheet.appendRow(newResponsableRow);

        // Invalider le cache des responsables de l'admin
        clearAllCachesForUniversity(universityId, ['responsable']);
        logAction('adminAddResponsable', { name, email, classId, universityId });

        return createJsonResponse({ success: true, message: `Le responsable ${name} a été créé et assigné avec succès.` });
    } catch (error) {
        logError('adminAddResponsable', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU : Récupère la liste des responsables pour une université.
 */
function getResponsablesForAdmin(data) {
    const { universityId } = data;
    if (!universityId) return createJsonResponse({ success: false, error: "Session administrateur invalide." });

    const cacheKey = `responsables_${universityId}`;
    try {
        const responsables = getCachedData(cacheKey, () => {
            const responsablesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESPONSABLES);
            const responsablesData = responsablesSheet.getDataRange().getValues();
            const headers = responsablesData.shift();
            const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');

            const filteredData = responsablesData.filter(row => row[univFkIdx] === universityId);
            return filteredData.map(row => {
                const responsable = {};
                headers.forEach((header, i) => responsable[header] = row[i]);
                return responsable;
            });
        }, 300); // Cache de 5 minutes

        return createJsonResponse({ success: true, data: responsables });
    } catch (error) {
        logError('adminGetResponsables', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère la liste des étudiants pour la classe d'un responsable.
 */
function responsableGetStudents(data) {
    const { responsableId } = data;
    if (!responsableId) return createJsonResponse({ success: false, error: 'Session responsable invalide.' });

    const cacheKey = `students_resp_${responsableId}`;
    try {
        const students = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();
            const classInfo = getResponsableClassInfo(responsableId, ctx);
            const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
            const headers = studentsData[0];
            const studentClassFkIdx = headers.indexOf('ID_CLASSE_FK');

            return studentsData.slice(1)
                .filter(row => row[studentClassFkIdx] === classInfo.classId)
                .map(row => {
                    const student = Object.fromEntries(headers.map((header, i) => [header, row[i]]));
                    student.ID_RFID = student.ID_RFID || null; // S'assurer que la propriété existe
                    return student;
                });
        }, 180); // Cache de 3 minutes

        return createJsonResponse({ success: true, data: students });
    } catch (error) {
        logError('responsableGetStudents', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère l'historique des présences pour la classe d'un responsable.
 */
function responsableGetAttendance(data) {
    const { responsableId } = data;
    if (!responsableId) return createJsonResponse({ success: false, error: 'Session responsable invalide.' });

    const cacheKey = `attendance_resp_${responsableId}`;
    try {
        const attendance = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();
            const classInfo = getResponsableClassInfo(responsableId, ctx);
            const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
            const headers = scanData[0];
            const classIdx = headers.indexOf('CLASSE');

            return scanData.slice(1)
                .filter(row => row[classIdx] === classInfo.className)
                .map(row => Object.fromEntries(headers.map((header, i) => [header, row[i]])))
                .sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));
        }, 180); // Cache de 3 minutes

        return createJsonResponse({ success: true, data: attendance });
    } catch (error) {
        logError('responsableGetAttendance', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère le nom d'un étudiant pour un responsable.
 */
function responsableGetStudentDetails(data) {
  try {
    const { responsableId, studentId } = data;
    if (!responsableId || !studentId) {
      throw new Error("Données manquantes.");
    }

    // Security check: Does this student belong to the responsable's class?
    const classInfo = getResponsableClassInfo(responsableId, createRequestContext());
    const studentMap = getStudentMap();
    const studentInfo = studentMap[studentId.trim().toUpperCase()];

    if (!studentInfo) {
      throw new Error(`Étudiant avec l'ID ${studentId} non trouvé.`);
    }

    // Vérifie si l'étudiant appartient bien à la classe du responsable
    if (studentInfo.classId !== classInfo.classId) {
      throw new Error(`Cet étudiant n'appartient pas à votre classe.`);
    }

    // On ne renvoie que le nom pour des raisons de sécurité et de simplicité
    return createJsonResponse({ success: true, data: { studentName: studentInfo.name } });

  } catch (error) {
    logError('responsableGetStudentDetails', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Récupère le cours actuel pour la classe d'un responsable.
 */
function responsableGetCurrentCourse(data, ctx) {
  try {
    const { responsableId } = data; // OPTIMISATION: Le contexte est maintenant passé en paramètre
    if (!responsableId) throw new Error("Session responsable invalide."); // depuis doPost.

    // Récupère le nom de la classe du responsable
    const classInfo = getResponsableClassInfo(responsableId, ctx);

    // Appelle la fonction existante avec le nom de la classe
    return getCurrentCourse({ classe: classInfo.className });

  } catch (error) {
    logError('responsableGetCurrentCourse', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Génère le QR code de présence pour la classe du responsable.
 */
function getQrCodeForResponsable(data) {
  try {
    const { responsableId } = data;
    if (!responsableId) throw new Error('Session responsable invalide.');

    const respSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESPONSABLES);
    const respData = respSheet.getDataRange().getValues();
    const respIdIdx = respData[0].indexOf('ID_RESPONSABLE');
    const classFkIdx = respData[0].indexOf('ID_CLASSE_FK');
    const responsableRow = respData.find(row => row[respIdIdx] === responsableId);
    if (!responsableRow) throw new Error('Responsable non trouvé.');
    
    const classId = responsableRow[classFkIdx];

    const classesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CLASSES);
    const classesData = classesSheet.getDataRange().getValues();
    const classIdIdx = classesData[0].indexOf('ID_CLASSE');
    const classNameIdx = classesData[0].indexOf('NOM_CLASSE');
    const classRow = classesData.find(row => row[classIdIdx] === classId);
    if (!classRow) throw new Error('Classe du responsable non trouvée.');
    const className = classRow[classNameIdx];

    const config = getConfiguration();
    const frontendUrl = config.FRONTEND_URL;
    if (!frontendUrl) throw new Error("L'URL du frontend n'est pas configurée.");

    const attendanceUrl = `${frontendUrl}?page=attendance&classe=${encodeURIComponent(className)}`;
    const qrCodeUrl = `https://quickchart.io/qr?text=${encodeURIComponent(attendanceUrl)}&size=250&ecLevel=H&margin=2`;

    return createJsonResponse({ success: true, data: { qrCodeUrl, className } });

  } catch (error) {
    logError('getQrCodeForResponsable', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}
/**
 * NOUVEAU: Récupère le planning de la classe d'un étudiant.
 */
function getStudentSchedule(data) {
  const { studentId } = data;
  if (!studentId) return createJsonResponse({ success: false, error: 'ID Étudiant manquant.' });
  const cacheKey = `schedule_student_${studentId}`;
  try {
    const schedule = getCachedData(cacheKey, () => findStudentSchedule(studentId), 180);
    return createJsonResponse({ success: true, data: schedule });
  } catch (error) {
    logError('getStudentSchedule', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}
/**
 * NOUVEAU : Récupère les données de présence pour une université.
 */
function getAttendanceForAdmin(data) {
    try {
        const { universityId } = data;
        if (!universityId) {
            return createJsonResponse({ success: false, error: "Session administrateur invalide." });
        }

        // --- OPTIMISATION : Récupérer les IDs des étudiants de l'université ---
        const studentIdsForUniv = getCachedData(`student_ids_${universityId}`, () => {
            const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
            const studentsData = studentsSheet.getDataRange().getValues();
            const headers = studentsData.shift();
            const idIdx = headers.indexOf('ID_ETUDIANT');
            const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK');
            
            const ids = new Set();
            studentsData.forEach(row => {
                if (row[univFkIdx] === universityId) {
                    ids.add(row[idIdx]);
                }
            });
            return Array.from(ids); // Convert Set to Array for JSON stringification
        }, 600); // Cache de 10 minutes

        const studentIdSet = new Set(studentIdsForUniv);

        const scanSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
        const scanData = scanSheet.getDataRange().getValues();
        const scanHeaders = scanData.shift();
        const studentIdIdx = scanHeaders.indexOf('ID_ETUDIANT');

        const filteredScans = scanData.filter(row => studentIdSet.has(row[studentIdIdx]));

        const scansAsObjects = filteredScans.map(row => {
            const scan = {};
            scanHeaders.forEach((header, i) => scan[header] = row[i]);
            return scan;
        }).sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP)); // Trier par date décroissante

        return createJsonResponse({ success: true, data: scansAsObjects });

    } catch (error) {
        logError('adminGetAttendance', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Connecte un étudiant.
 */
function studentLogin(data) {
  try {
    const { studentId } = data;
    if (!studentId) {
      return createJsonResponse({ success: false, error: 'ID Étudiant manquant.' });
    }
    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
    const studentsData = studentsSheet.getDataRange().getValues();
    const headers = studentsData.shift();
    const idIdx = headers.indexOf('ID_ETUDIANT');
    
    const studentRow = studentsData.find(row => row[idIdx] && row[idIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase());

    if (studentRow) {
      // On ne renvoie que l'ID pour confirmation, les autres données seront chargées séparément.
      logAction('studentLogin', { studentId, success: true });
      return createJsonResponse({ success: true, data: { studentId: studentRow[idIdx] } });
    } else {
      return createJsonResponse({ success: false, error: 'ID Étudiant non trouvé.' });
    }
  } catch (error) {
    logError('studentLogin', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}

/**
 * NOUVEAU: Récupère les données d'un étudiant pour son tableau de bord.
 */
function getStudentData(data) {
    const { studentId } = data;
    if (!studentId) return createJsonResponse({ success: false, error: 'ID Étudiant manquant.' });

    // Le cache est spécifique à l'étudiant.
    const cacheKey = `student_data_${studentId}`;
    try {
        const studentInfo = getCachedData(cacheKey, () => {
            const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
            const studentsData = studentsSheet.getDataRange().getValues();
            const headers = studentsData.shift();
            const idIdx = headers.indexOf('ID_ETUDIANT');
            const nameIdx = headers.indexOf('NOM_COMPLET');
            const emailIdx = headers.indexOf('EMAIL');
            const telIdx = headers.indexOf('NUMERO_TELEPHONE'); // NOUVEAU
            const rfidIdx = headers.indexOf('ID_RFID'); // NOUVEAU: RFID

            const studentRow = studentsData.find(row => row[idIdx] && row[idIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase());

            if (studentRow) {
                return {
                    name: studentRow[nameIdx],
                    email: studentRow[emailIdx],
                    telephone: studentRow[telIdx] || '', // NOUVEAU
                    rfidId: studentRow[rfidIdx] || null // NOUVEAU: RFID
                };
            } else {
                throw new Error('Étudiant non trouvé.');
            }
        }, 600); // Cache de 10 minutes pour les infos de l'étudiant

        return createJsonResponse({ success: true, data: studentInfo });

    } catch (error) {
        logError('getStudentData', error);
        return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
    }
}

/**
 * NOUVEAU: Récupère toutes les données du dashboard étudiant en un seul appel.
 */
function getStudentDashboardData(data) {
  const { studentId } = data;
  if (!studentId) return createJsonResponse({ success: false, error: 'ID Étudiant manquant.' });

  const cacheKey = `dashboard_student_${studentId}`;
  try {
    const dashboardData = getCachedData(cacheKey, () => {
      const profileResponse = getStudentData({ studentId });
      const scheduleResponse = getStudentSchedule({ studentId });
      const attendanceResponse = getStudentAttendanceHistory({ studentId });

      const profileResult = JSON.parse(profileResponse.getContent());
      const scheduleResult = JSON.parse(scheduleResponse.getContent());
      const attendanceResult = JSON.parse(attendanceResponse.getContent());

      // Vérifier que chaque appel a réussi avant de construire la réponse
      if (!profileResult.success || !scheduleResult.success || !attendanceResult.success) {
        throw new Error("Une des sous-requêtes pour le dashboard a échoué.");
      }

      // NOUVEAU: Calcul du taux de participation/absence
      const totalConfirmedCourses = scheduleResult.data.filter(c => c.STATUT === 'Confirmé').length;
      const totalPresences = attendanceResult.data.length;
      let participationRate = 0;
      let absenceRate = 0;

      if (totalConfirmedCourses > 0) {
        participationRate = (totalPresences / totalConfirmedCourses) * 100;
        absenceRate = 100 - participationRate;
      }

      const attendanceStats = {
          participationRate: parseFloat(participationRate.toFixed(1)),
          absenceRate: parseFloat(absenceRate.toFixed(1))
      };

      return { profile: profileResult.data, schedule: scheduleResult.data, attendance: attendanceResult.data, attendanceStats: attendanceStats };
    }, 120); // Cache de 2 minutes
    return createJsonResponse({ success: true, data: dashboardData });
  } catch (error) {
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}
/**
 * NOUVEAU: Met à jour les informations d'un étudiant.
 */
function updateStudentInfo(data) {
  try {
    const { studentId, name, email, telephone } = data; // NOUVEAU: ajout de telephone
    if (!studentId || !name || !email) return createJsonResponse({ success: false, error: 'Données manquantes.' });

    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
    const studentsData = studentsSheet.getDataRange().getValues();
    const headers = studentsData.shift();
    const idIdx = headers.indexOf('ID_ETUDIANT');
    const nameIdx = headers.indexOf('NOM_COMPLET');
    const emailIdx = headers.indexOf('EMAIL');
    const telIdx = headers.indexOf('NUMERO_TELEPHONE'); // NOUVEAU

    const rowIndex = studentsData.findIndex(row => row[idIdx] && row[idIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase());

    if (rowIndex !== -1) {
      // rowIndex est 0-based pour le tableau de données, mais les lignes de la feuille sont 1-based et ont un en-tête, donc on ajoute 2.
      studentsSheet.getRange(rowIndex + 2, nameIdx + 1).setValue(name);
      studentsSheet.getRange(rowIndex + 2, emailIdx + 1).setValue(email);
      if (telIdx !== -1) studentsSheet.getRange(rowIndex + 2, telIdx + 1).setValue(telephone); // NOUVEAU

      // Invalider le cache spécifique de l'étudiant après la mise à jour
      cache.remove(`student_data_${studentId}`);
      logAction('updateStudentInfo', { studentId });

      return createJsonResponse({ success: true, message: 'Informations mises à jour avec succès.' });
    } else {
      return createJsonResponse({ success: false, error: 'Étudiant non trouvé.' });
    }
  } catch (error) {
    logError('updateStudentInfo', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}

/**
 * NOUVEAU: Récupère les statistiques pour le tableau de bord de l'administrateur.
 */
function getAdminDashboardStats(data) {
    const { universityId } = data;
    if (!universityId) return createJsonResponse({ success: false, error: "Session administrateur invalide." });

    const cacheKey = `dashboard_stats_${universityId}`;
    try {
        const stats = getCachedData(cacheKey, () => {
            const ss = SpreadsheetApp.getActiveSpreadsheet();
            const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
            const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
            const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);

            const allowedFiliereIds = getFiliereIdsForUniversity(universityId);

            const classesData = classesSheet.getDataRange().getValues();
            const classFiliereFkIdx = classesData[0].indexOf('ID_FILIERE_FK');
            const classCount = classesData.filter(row => allowedFiliereIds.includes(row[classFiliereFkIdx])).length;

            const studentsData = studentsSheet.getDataRange().getValues();
            const studentUnivFkIdx = studentsData[0].indexOf('ID_UNIVERSITE_FK');
            const studentFiliereFkIdx = studentsData[0].indexOf('ID_FILIERE_FK');
            const studentsOfUniv = studentsData.filter(row => row[studentUnivFkIdx] === universityId);
            const studentCount = studentsOfUniv.length;

            const filieresData = filieresSheet.getDataRange().getValues();
            const filiereIdIdx = filieresData[0].indexOf('ID_FILIERE');
            const filiereNameIdx = filieresData[0].indexOf('NOM_FILIERE');
            const filiereMap = Object.fromEntries(filieresData.map(row => [row[filiereIdIdx], row[filiereNameIdx]]));

            const studentsByFiliere = studentsOfUniv.reduce((acc, row) => {
                const filiereName = filiereMap[row[studentFiliereFkIdx]] || 'Non assigné';
                acc[filiereName] = (acc[filiereName] || 0) + 1;
                return acc;
            }, {});

            return { studentCount, classCount, studentsByFiliere };
        }, 300); // Cache de 5 minutes

        return createJsonResponse({ success: true, data: stats });
    } catch (error) {
        logError('adminGetDashboardStats', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Connecte un responsable de classe.
 */
function responsableLogin(data) {
  try {
    const { email, password } = data;
    if (!email || !password) {
      return createJsonResponse({ success: false, error: 'Email et mot de passe requis.' });
    }

    const respSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESPONSABLES);
    const respData = respSheet.getDataRange().getValues();
    const headers = respData.shift();
    const emailIdx = headers.indexOf('EMAIL_RESPONSABLE');
    const hashIdx = headers.indexOf('PASSWORD_HASH');
    const saltIdx = headers.indexOf('SALT');
    const idIdx = headers.indexOf('ID_RESPONSABLE');
    const univFkIdx = headers.indexOf('ID_UNIVERSITE_FK'); // NOUVEAU

    for (const row of respData) {
      if (row[emailIdx] === email && verifyPassword(password, row[hashIdx], row[saltIdx])) {
        // CORRECTION: Le token est maintenant un composite de l'ID du responsable et de l'ID de l'université.
        const token = `${row[idIdx]}:${row[univFkIdx]}`;
        logAction('responsableLogin', { email, success: true });
        return createJsonResponse({ success: true, token: token });
      }
    }
    return createJsonResponse({ success: false, error: 'Email ou mot de passe de responsable incorrect.' });
  } catch (error) {
    logError('responsableLogin', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}

/**
 * NOUVEAU: Récupère les données du tableau de bord pour un responsable.
 */
function getResponsableDashboardData(data) {
    const { responsableId } = data;
    if (!responsableId) return createJsonResponse({ success: false, error: 'Session responsable invalide.' });

    // Le cache est spécifique au responsable.
    const cacheKey = `dashboard_resp_${responsableId}`;
    try {
        const dashboardData = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();
            // 1. Récupérer les informations de base (classe, université)
            const classInfo = getResponsableClassInfo(responsableId, ctx);

            // 2. Récupérer les informations du profil du responsable
            const respData = _getRawSheetData(SHEET_NAMES.RESPONSABLES, ctx);
            const respHeaders = respData[0];
            const respIdIdx = respHeaders.indexOf('ID_RESPONSABLE');
            const respNameIdx = respHeaders.indexOf('NOM_RESPONSABLE');
            const respEmailIdx = respHeaders.indexOf('EMAIL_RESPONSABLE');
            const responsableRow = respData.slice(1).find(row => row[respIdIdx] === responsableId);
            const profile = responsableRow ? { name: responsableRow[respNameIdx], email: responsableRow[respEmailIdx] } : {};
            
            // 3. Récupérer les modules de la classe pour le formulaire d'ajout
            const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
            const modulesHeaders = modulesData[0];
            const modClassFkIdx = modulesHeaders.indexOf('ID_CLASSE_FK');
            const classModules = modulesData.slice(1)
                .filter(row => row[modClassFkIdx] === classInfo.classId)
                .map(row => Object.fromEntries(modulesHeaders.map((h, i) => [h, row[i]])));

            // 4. Récupérer le planning de la classe
            const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
            const planningHeaders = planningData[0];
            const planningModuleFkIdx = planningHeaders.indexOf('ID_MODULE_FK');
            
            // Créer une map pour retrouver facilement le nom et l'enseignant d'un module
            const moduleInfoMap = new Map(classModules.map(m => [m.ID_MODULE, { name: m.NOM_MODULE, teacher: m.NOM_ENSEIGNANT }]));
            const moduleIdsForClass = new Set(classModules.map(m => m.ID_MODULE));

            const courses = planningData.slice(1)
                .filter(row => moduleIdsForClass.has(row[planningModuleFkIdx]))
                .map(row => {
                    const course = Object.fromEntries(planningHeaders.map((h, i) => [h, row[i]]));
                    const moduleInfo = moduleInfoMap.get(course.ID_MODULE_FK);
                    course.NOM_MODULE = moduleInfo ? moduleInfo.name : 'Module Inconnu';
                    return course;
                }).sort((a, b) => new Date(a.DATE_COURS) - new Date(b.DATE_COURS));
            // CORRECTION: Renvoyer également les modules pour peupler le formulaire.
            return { profile, className: classInfo.className, courses, modules: classModules };
        }, 180); // Cache de 3 minutes pour le dashboard du responsable

        return createJsonResponse({ success: true, data: dashboardData });

    } catch (error) {
        logError('getResponsableDashboardData', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Ajoute un module pour la classe d'un responsable.
 * @param {object} data - Contient { responsableId, payload: { name, enseignant } }.
 */
function responsableAddModule(data) {
    try {
        const { responsableId, payload } = data;
        const { name, enseignant } = payload;
        if (!responsableId || !name || !enseignant) {
            throw new Error("Nom du module et nom de l'enseignant sont requis.");
        }

        const ctx = createRequestContext();
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId, universityId } = classInfo;

        const modulesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.MODULES);
        const newId = `MOD-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
        
        // ['ID_MODULE', 'NOM_MODULE', 'ID_CLASSE_FK', 'ID_UNIVERSITE_FK', 'NOM_ENSEIGNANT', 'STATUT']
        const newModuleRow = [newId, name, classId, universityId, enseignant, 'En cours'];
        modulesSheet.appendRow(newModuleRow);
        SpreadsheetApp.flush();

        // Invalider les caches pertinents
        cache.removeAll([`modules_resp_${responsableId}`, `dashboard_resp_${responsableId}`]);
        logAction('responsableAddModule', { responsableId, name });

        return createJsonResponse({ success: true, message: `Le module "${name}" a été créé avec succès.` });
    } catch (error) {
        logError('responsableAddModule', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Force la suppression de tous les caches pour un responsable.
 */
function responsableForceRefresh(data) {
    try {
        const { responsableId } = data;
        if (!responsableId) throw new Error("ID Responsable manquant.");

        const keysToClear = [
            `dashboard_resp_${responsableId}`, `resp_class_info_${responsableId}`,
            `students_resp_${responsableId}`, `attendance_resp_${responsableId}`,
            `modules_resp_${responsableId}`, `notifs_status_${responsableId}`
        ];
        cache.removeAll(keysToClear);
        logAction('responsableForceRefresh', { responsableId });
        return createJsonResponse({ success: true, message: "Les données sont en cours de mise à jour. Cela peut prendre un instant." });
    } catch (error) {
        logError('responsableForceRefresh', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Helper pour récupérer les informations de la classe d'un responsable.
 * @param {string} responsableId - L'ID du responsable.
 * @returns {{classId: string, className: string, universityId: string}}
 */
function getResponsableClassInfo(responsableId, ctx) {
    // OPTIMISATION: Utiliser le cache pour les informations de classe du responsable.
    const cacheKey = `resp_class_info_${responsableId}`;
    const cachedInfo = getCachedData(cacheKey, () => {
        const respData = _getRawSheetData(SHEET_NAMES.RESPONSABLES, ctx);
        const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, ctx);

        // 1. Trouver le responsable et sa classe
        const respHeaders = respData[0];
        const respIdIdx = respHeaders.indexOf('ID_RESPONSABLE');
        const classFkIdx = respHeaders.indexOf('ID_CLASSE_FK');
        const univFkIdx = respHeaders.indexOf('ID_UNIVERSITE_FK');
        const respNameIdx = respHeaders.indexOf('NOM_RESPONSABLE'); // NOUVEAU
        const responsableRow = respData.slice(1).find(row => row[respIdIdx] === responsableId);
        if (!responsableRow) throw new Error('Responsable non trouvé.');
        const classId = responsableRow[classFkIdx];
        const universityId = responsableRow[univFkIdx];        const responsableName = responsableRow[respNameIdx]; // NOUVEAU

        // 2. Trouver le nom de la classe
        const classesHeaders = classesData[0];
        const classIdIdx = classesHeaders.indexOf('ID_CLASSE');
        const classNameIdx = classesHeaders.indexOf('NOM_CLASSE');
        const classRow = classesData.slice(1).find(row => row[classIdIdx] === classId);
        if (!classRow) throw new Error('Classe assignée au responsable introuvable.');
        const className = classRow[classNameIdx];
        return { classId, className, universityId, responsableName }; // NOUVEAU: Renvoyer aussi le nom
    }, 3600); // Cache pour 1 heure

    return cachedInfo;
}

/**
 * NOUVEAU: Met à jour le statut d'un cours pour un responsable.
 */
function updateCourseStatusForResponsable(data) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const { responsableId, courseId, status } = data;
    if (!responsableId || !courseId || !status) {
      return createJsonResponse({ success: false, error: 'Données manquantes.' });
    }
    if (!['Confirmé', 'Annulé'].includes(status)) {
      return createJsonResponse({ success: false, error: 'Statut invalide.' });
    }
    
    // CORRECTION: Logique de vérification de sécurité entièrement revue.
    const ctx = createRequestContext();
    const classInfo = getResponsableClassInfo(responsableId, ctx);
    const classId = classInfo.classId;
    const universityId = classInfo.universityId;

    // Find and update course
    const planningSheet = ss.getSheetByName(SHEET_NAMES.PLANNING);
    const planningData = planningSheet.getDataRange().getValues();
    const headers = planningData[0];
    const courseIdIdx = headers.indexOf('ID_COURS');
    const moduleIdFkIdx = headers.indexOf('ID_MODULE_FK');
    const statusIdx = headers.indexOf('STATUT');

    const courseRowIndex = planningData.findIndex((row, index) => index > 0 && row[courseIdIdx] === courseId);
    if (courseRowIndex === -1) throw new Error('Cours non trouvé.');

    // Vérification de sécurité : le module du cours appartient-il bien à la classe du responsable ?
    const courseModuleId = planningData[courseRowIndex][moduleIdFkIdx];
    const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
    const moduleRow = modulesData.slice(1).find(row => row[0] === courseModuleId); // row[0] is ID_MODULE
    if (!moduleRow || moduleRow[2] !== classId) { // moduleRow[2] is ID_CLASSE_FK
        throw new Error("Action non autorisée. Ce cours n'appartient pas à votre classe.");
    }

    planningSheet.getRange(courseRowIndex + 1, statusIdx + 1).setValue(status);

    // NOUVEAU: Invalider le cache de l'emploi du temps pour tous les étudiants de la classe.
    const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
    const studentsData = studentsSheet.getDataRange().getValues();
    const studentHeaders = studentsData.shift();
    const studentClassFkIdx = studentHeaders.indexOf('ID_CLASSE_FK');
    const studentIdIdx = studentHeaders.indexOf('ID_ETUDIANT');
    const studentIdsToClear = studentsData
        .filter(row => row[studentClassFkIdx] === classId)
        .map(row => row[studentIdIdx]);
    const studentCacheKeys = studentIdsToClear.map(id => `schedule_student_${id}`);

    // Invalider les caches pertinents après la mise à jour
    cache.removeAll([`dashboard_resp_${responsableId}`, ...studentCacheKeys]); // Cache du responsable + tous les étudiants concernés
    clearAllCachesForUniversity(universityId, ['planning']); // Cache de l'admin
    logAction('responsableUpdateCourseStatus', { responsableId, courseId, status });

    return createJsonResponse({ success: true, message: `Le statut du cours a été mis à jour à "${status}".` });

  } catch (error) {
    logError('updateCourseStatusForResponsable', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Ajoute un cours pour la classe d'un responsable.
 */
function addCourseForResponsable(data) {
  try {
    const { responsableId, payload } = data;
    const { moduleId, date, startTime, endTime } = payload;
    if (!moduleId || !date || !startTime || !endTime) {
      throw new Error("Toutes les informations du cours sont requises.");
    }

    const ctx = createRequestContext();
    const classInfo = getResponsableClassInfo(responsableId, ctx);

    // Vérifier que le module appartient bien à la classe du responsable et n'est pas terminé
    const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
    const modIdIdx = modulesData[0].indexOf('ID_MODULE');
    const modClassFkIdx = modulesData[0].indexOf('ID_CLASSE_FK');
    const modStatusIdx = modulesData[0].indexOf('STATUT');
    const moduleRow = modulesData.slice(1).find(row => row[modIdIdx] === moduleId); // Slice(1) to skip headers

    if (!moduleRow) {
      throw new Error("Module non trouvé.");
    }
    if (moduleRow[modClassFkIdx] !== classInfo.classId) {
      throw new Error("Action non autorisée. Ce module n'appartient pas à votre classe.");
    }
    if (moduleRow[modStatusIdx] === 'Terminé') {
      throw new Error(`Ce module est terminé. Vous ne pouvez plus y ajouter de cours.`);
    }

    const newId = `CRS-${Utilities.getUuid().substring(0, 4).toUpperCase()}`;
    const newCourseRow = [newId, moduleId, new Date(date), startTime, endTime, 'En attente'];
        SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PLANNING).appendRow(newCourseRow);
        
        // Invalider les caches pertinents après l'ajout
        cache.remove(`dashboard_resp_${responsableId}`);
        clearAllCachesForUniversity(classInfo.universityId, ['planning', 'module']); // Invalidate module cache as well
        logAction('addCourseForResponsable', { responsableId, moduleId });

    return createJsonResponse({ success: true, message: `Le cours a été ajouté au planning avec le statut "En attente".` });
    } catch (error) {
        logError('addCourseForResponsable', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Supprime un cours pour un responsable.
 */
function deleteCourseForResponsable(data) {
  try {
    const { responsableId, courseId } = data;
    if (!responsableId || !courseId) {
      return createJsonResponse({ success: false, error: 'Données manquantes.' });
    }

    // Security check: find responsable's class info
    const ctx = createRequestContext();
    const classInfo = getResponsableClassInfo(responsableId, ctx);
    const className = classInfo.className;
    const universityId = classInfo.universityId;

    // Find and delete course
    const planningSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PLANNING);
    const planningData = planningSheet.getDataRange().getValues();
    const planningHeaders = planningData.shift();
    const courseIdIdx = planningHeaders.indexOf('ID_COURS');
    const moduleIdFkIdx = planningHeaders.indexOf('ID_MODULE_FK'); // NOUVEAU

    const rowIndex = planningData.findIndex(row => row[courseIdIdx] === courseId);
    if (rowIndex === -1) throw new Error('Cours non trouvé.');

    // NOUVEAU: Final security check: Does this course belong to the responsable's class?
    const courseModuleId = planningData[rowIndex][moduleIdFkIdx];
    const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
    const moduleHeaders = modulesData[0];
    const modIdIdx = moduleHeaders.indexOf('ID_MODULE');
    const modClassFkIdx = moduleHeaders.indexOf('ID_CLASSE_FK');
    const moduleRow = modulesData.slice(1).find(row => row[modIdIdx] === courseModuleId);

    if (!moduleRow || moduleRow[modClassFkIdx] !== classInfo.classId) {
      throw new Error("Action non autorisée. Ce cours n'appartient pas à votre classe.");
    }

    planningSheet.deleteRow(rowIndex + 2); // +2 because findIndex is 0-based and headers were shifted
    cache.remove(`dashboard_resp_${responsableId}`);
    cache.remove(`modules_resp_${responsableId}`); // Invalidate module cache
    logAction('responsableDeleteCourse', { responsableId, courseId });
    return createJsonResponse({ success: true, message: 'Le cours a été supprimé avec succès.' });
  } catch (error) {
    logError('deleteCourseForResponsable', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}
/**
 * NOUVEAU: Génère le lien d'inscription pour la classe du responsable.
 */
function getRegLinkForResponsable(data) {
  try {
    const { responsableId } = data;
    if (!responsableId) throw new Error('Session responsable invalide.');

    const respSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.RESPONSABLES);
    const respData = respSheet.getDataRange().getValues();
    const respIdIdx = respData[0].indexOf('ID_RESPONSABLE');
    const classFkIdx = respData[0].indexOf('ID_CLASSE_FK');
    const univFkIdx = respData[0].indexOf('ID_UNIVERSITE_FK');
    const responsableRow = respData.find(row => row[respIdIdx] === responsableId);
    if (!responsableRow) throw new Error('Responsable non trouvé.');
    
    const classId = responsableRow[classFkIdx];
    const universityId = responsableRow[univFkIdx];

    const config = getConfiguration();
    const frontendUrl = config.FRONTEND_URL;
    if (!frontendUrl) throw new Error("L'URL du frontend n'est pas configurée.");

    const registrationLink = `${frontendUrl}?page=class-register&universityId=${encodeURIComponent(universityId)}&classId=${encodeURIComponent(classId)}`;

    return createJsonResponse({ success: true, data: { url: registrationLink } });

  } catch (error) {
    logError('getRegLinkForResponsable', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}
/**
 * NOUVEAU: Récupère l'historique de présence d'un étudiant.
 */
function getStudentAttendanceHistory(data) {
    const { studentId } = data;
    if (!studentId) return createJsonResponse({ success: false, error: 'ID Étudiant manquant.' });

    // Le cache est spécifique à l'étudiant.
    const cacheKey = `attendance_history_${studentId}`;
    try {
        const history = getCachedData(cacheKey, () => {
            const scanSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
            const scanData = scanSheet.getDataRange().getValues();
            const headers = scanData.shift();
            const studentIdIdx = headers.indexOf('ID_ETUDIANT');

            return scanData
                .filter(row => row[studentIdIdx] && row[studentIdIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase())
                .map(row => {
                    const record = {};
                    headers.forEach((header, i) => record[header] = row[i]);
                    return record;
                })
                .sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP)); // Trier par ordre décroissant
        }, 300); // Cache de 5 minutes pour l'historique

        return createJsonResponse({ success: true, data: history });

    } catch (error) {
        logError('getStudentAttendanceHistory', error);
        return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
    }
}
/**
 * NOUVEAU : Enregistre la présence d'un étudiant depuis le formulaire HTML.
 */
function recordAttendance(data) {
  try {
    const { studentId, classe, module } = data;
    if (!studentId || !classe || !module) {
      return createJsonResponse({ success: false, error: 'Données de présence manquantes.' });
    }

    const studentMap = getStudentMap();
    const studentInfo = studentMap[studentId.trim().toUpperCase()];
    const studentName = studentInfo ? studentInfo.name : 'Inconnu';

    const scanSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
    const scanData = scanSheet.getDataRange().getValues();
    const headers = scanData[0];
    const studentIdIdx = headers.indexOf('ID_ETUDIANT');
    const moduleIdx = headers.indexOf('MODULE');
    const dateScanIdx = headers.indexOf('DATE_SCAN');

    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // SÉCURITÉ: Vérifier si l'étudiant est déjà présent pour ce cours aujourd'hui
    const isAlreadyPresent = scanData.slice(1).some(row =>
      row[studentIdIdx] === studentId &&
      row[moduleIdx] === module &&
      Utilities.formatDate(new Date(row[dateScanIdx]), Session.getScriptTimeZone(), 'yyyy-MM-dd') === todayStr
    );

    if (isAlreadyPresent) {
      return createJsonResponse({ success: true, message: `${studentName} est déjà marqué(e) présent(e) pour ce cours.` });
    }

    const timestamp = new Date();
    scanSheet.appendRow([timestamp, studentId, studentName, classe, module, todayStr, Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm:ss'), 'Présent']);

        // Invalider le cache de l'historique de l'étudiant
        cache.remove(`attendance_history_${studentId.trim().toUpperCase()}`);
        logAction('recordAttendance', { studentId, classe, module });

        return createJsonResponse({ success: true, message: `Présence enregistrée avec succès pour ${studentName} (${studentId}).` });
    } catch (error) {
    logError('recordAttendance', error);
    return createJsonResponse({ success: false, error: `Erreur interne lors de l'enregistrement: ${error.message}` });
    }
}

/**
 * NOUVEAU : Trouve le cours actuel pour une classe donnée.
 */
function getCurrentCourse(data) {
  try {
    const { classe } = data;
    if (!classe) {
      return createJsonResponse({ success: false, error: 'Paramètre "classe" manquant.' });
    }

    const planningSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.PLANNING);
    if (!planningSheet) {
      return createJsonResponse({ success: false, error: 'Erreur Système: L\'onglet "Planning" est introuvable.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    // --- MODIFICATION: Utiliser le fuseau horaire du Google Sheet pour toutes les comparaisons ---
    const spreadsheetTimeZone = ss.getSpreadsheetTimeZone();
    const todayStr = Utilities.formatDate(now, spreadsheetTimeZone, 'yyyy-MM-dd');

    const planningData = planningSheet.getDataRange().getValues();
    const headers = planningData.shift();
    
    const classeIdx = headers.indexOf('CLASSE');
    const moduleIdFkIdx = headers.indexOf('ID_MODULE_FK'); // NOUVEAU
    const dateIdx = headers.indexOf('DATE_COURS');
    const startIdx = headers.indexOf('HEURE_DEBUT');
    const endIdx = headers.indexOf('HEURE_FIN');
    const statutIdx = headers.indexOf('STATUT');

    // NOUVEAU: Récupérer les informations du module et de la classe
    const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, createRequestContext());
    const moduleHeaders = modulesData[0];
    const modIdIdx = moduleHeaders.indexOf('ID_MODULE');
    const modNameIdx = moduleHeaders.indexOf('NOM_MODULE');
    const modClassFkIdx = moduleHeaders.indexOf('ID_CLASSE_FK');
    const moduleMap = new Map(modulesData.slice(1).map(row => [row[modIdIdx], { name: row[modNameIdx], classId: row[modClassFkIdx] }]));

    const classesData = _getRawSheetData(SHEET_NAMES.CLASSES, createRequestContext());
    const classMap = new Map(classesData.slice(1).map(row => [row[0], row[1]])); // ID_CLASSE -> NOM_CLASSE

    if ([moduleIdFkIdx, dateIdx, startIdx, endIdx, statutIdx].includes(-1)) {
        return createJsonResponse({ success: false, error: 'Erreur de Configuration: Colonnes manquantes dans Planning.' });
    }

    // AMÉLIORATION: Trouver tous les cours confirmés pour aujourd'hui et prendre le plus récent.
    const confirmedTodayCourses = planningData.filter(row => {
        if (!row[dateIdx] || !(row[dateIdx] instanceof Date)) return false;

        const courseDateStr = Utilities.formatDate(row[dateIdx], spreadsheetTimeZone, 'yyyy-MM-dd');
        if (courseDateStr !== todayStr) return false;

        const status = row[statutIdx] ? row[statutIdx].toString().trim().toLowerCase() : '';
        if (status !== 'confirmé') return false;

        const courseModuleId = row[moduleIdFkIdx];
        const moduleInfo = moduleMap.get(courseModuleId);
        if (!moduleInfo) return false;

        const courseClassName = classMap.get(moduleInfo.classId);
        return courseClassName && courseClassName.toLowerCase() === classe.toString().trim().toLowerCase();
    });

    if (confirmedTodayCourses.length === 0) {
        return createJsonResponse({ success: false, error: `Aucun cours confirmé n'a été trouvé pour la classe "${classe}" aujourd'hui.` });
    }

    // Trier les cours par heure de début (du plus récent au plus ancien)
    confirmedTodayCourses.sort((a, b) => {
        const timeA = a[startIdx] instanceof Date ? a[startIdx].getTime() : 0;
        const timeB = b[startIdx] instanceof Date ? b[startIdx].getTime() : 0;
        return timeB - timeA;
    });

    // Le cours actuel est le premier de la liste triée (le plus récent)
    const currentCourseRow = confirmedTodayCourses[0];
    const currentModuleId = currentCourseRow[moduleIdFkIdx];
    const currentModuleInfo = moduleMap.get(currentModuleId);
    const currentClassName = classMap.get(currentModuleInfo.classId);

    const courseFound = { classe: currentClassName, module: currentModuleInfo.name };
    return createJsonResponse({ success: true, data: courseFound });

  } catch (error) {
    logError('getCurrentCourse', error);
    return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
  }
}
// ============================================================================
// FONCTIONS D'INITIALISATION ET UTILITAIRES (Mises à jour)
// ============================================================================

/**
 * Initialise la structure du Google Sheet (onglets, en-têtes).
 * MISE À JOUR : Ajout de la colonne DATE_INSCRIPTION.
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    'Confirmation de la Configuration',
    'Cette action va configurer votre Google Sheet pour ABM EduPilote. TOUTES les données et onglets existants seront supprimés et remplacés. Êtes-vous sûr de vouloir continuer ?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert('Configuration annulée.');
    return;
  }

  try {
    // 1. Nettoyer le Google Sheet
    ss.getSheets().forEach(sheet => {
      if (ss.getSheets().length > 1) { ss.deleteSheet(sheet); }
    });
    ss.getSheets()[0].setName('TEMP').clear();

    // 2. Définir la structure complète
    const sheetConfigs = {
      [SHEET_NAMES.DASHBOARD]: { headers: [], color: '#6a1b9a' },
      [SHEET_NAMES.CONFIG]: { headers: ['Clé', 'Valeur'], color: '#f4b400' },
      [SHEET_NAMES.UNIVERSITIES]: { headers: ['ID_UNIVERSITE', 'NOM_UNIVERSITE'], color: '#a61c00' },
      [SHEET_NAMES.FILIERES]: { headers: ['ID_FILIERE', 'NOM_FILIERE', 'ID_UNIVERSITE_FK', 'DATE_CREATION'], color: '#a61c00' },
      [SHEET_NAMES.CLASSES]: { headers: ['ID_CLASSE', 'NOM_CLASSE', 'ID_FILIERE_FK'], color: '#a61c00' },
      [SHEET_NAMES.RESPONSABLES]: { headers: ['ID_RESPONSABLE', 'NOM_RESPONSABLE', 'EMAIL_RESPONSABLE', 'PASSWORD_HASH', 'SALT', 'ID_CLASSE_FK', 'ID_UNIVERSITE_FK'], color: '#1a237e' },
      [SHEET_NAMES.ADMINS]: { headers: ['ID_ADMIN', 'EMAIL_ADMIN', 'PASSWORD_HASH', 'SALT', 'ID_UNIVERSITE_FK'], color: '#a61c00' },
      [SHEET_NAMES.PASSWORD_RESETS]: { headers: ['TIMESTAMP', 'EMAIL_ADMIN', 'STATUT'], color: '#ff6d00', validations: { 'STATUT': ['EN ATTENTE', 'TRAITÉ'] } }, // NOUVEAU: Ajout de NUMERO_TELEPHONE
      [SHEET_NAMES.MESSAGES]: { headers: ['ID_MESSAGE', 'TIMESTAMP', 'ID_UNIVERSITE_FK', 'ID_CLASSE_FK', 'SUJET', 'CORPS', 'AUTEUR_INFO'], color: '#00796b' },
      [SHEET_NAMES.STUDENTS]: { headers: ['ID_ETUDIANT', 'NOM_COMPLET', 'ID_FILIERE_FK', 'ID_CLASSE_FK', 'EMAIL', 'NUMERO_TELEPHONE', 'ID_UNIVERSITE_FK', 'DATE_INSCRIPTION', 'ID_RFID'], color: '#4285f4', validations: {} },
      [SHEET_NAMES.MESSAGE_READS]: { headers: ['ID_UTILISATEUR', 'ID_MESSAGE_FK', 'TIMESTAMP_LECTURE'], color: '#546e7a' },
      [SHEET_NAMES.MODULES]: { headers: ['ID_MODULE', 'NOM_MODULE', 'ID_CLASSE_FK', 'ID_UNIVERSITE_FK', 'NOM_ENSEIGNANT', 'STATUT'], color: '#fbc02d', validations: { 'STATUT': ['En cours', 'Terminé'] } },
      [SHEET_NAMES.PLANNING]: { headers: ['ID_COURS', 'ID_MODULE_FK', 'DATE_COURS', 'HEURE_DEBUT', 'HEURE_FIN', 'STATUT'], color: '#0f9d58', validations: { 'STATUT': ['Confirmé', 'Annulé', 'En attente'] } },
      [SHEET_NAMES.SCAN]: { headers: ['TIMESTAMP', 'ID_ETUDIANT', 'NOM_ETUDIANT', 'CLASSE', 'MODULE', 'DATE_SCAN', 'HEURE_SCAN', 'STATUT_PRESENCE'], color: '#db4437', validations: { 'STATUT_PRESENCE': ['Présent', 'Absent', 'En retard', 'Justifié'] } },
      [SHEET_NAMES.CONDUCT]: { headers: ['ID_INCIDENT', 'DATE', 'ID_ETUDIANT', 'NOM_ETUDIANT', 'CLASSE', 'DESCRIPTION_INCIDENT', 'MESURE_PRISE'], color: '#673ab7' },
      [SHEET_NAMES.ACTION_LOG]: { headers: ['TIMESTAMP', 'ACTION', 'DONNEES', 'UTILISATEUR_IP'], color: '#78909c' },
      [SHEET_NAMES.ERROR_LOG]: { headers: ['TIMESTAMP', 'ACTION', 'REQUETE', 'MESSAGE_ERREUR', 'SUGGESTION_DEBUG', 'PILE_APPEL'], color: '#d50000' }
      ,[SHEET_NAMES.AVIS]: { headers: ['TIMESTAMP', 'ROLE_UTILISATEUR', 'ID_UTILISATEUR', 'NOTES (Facilité, Design, Utilité)', 'POINTS_A_CORRIGER', 'IDEES_AMELIORATION', 'NOTE_ETOILEE'], color: '#ffc107' }
    };

    // 3. Créer et formater les onglets
    Object.entries(sheetConfigs).forEach(([name, config]) => {
      const sheet = ss.insertSheet(name);
      sheet.setTabColor(config.color);
      if (config.headers.length > 0) { // CORRECTION: On ne traite que les onglets qui ont des en-têtes
        const headerRange = sheet.getRange(1, 1, 1, config.headers.length);
        headerRange.setValues([config.headers]);
        headerRange.setBackground(config.color).setFontColor('#ffffff').setFontWeight('bold').setHorizontalAlignment('center');
        sheet.setFrozenRows(1);
      }

      const headers = config.headers;
      for (const colName in config.validations) {
        const colIndex = headers.indexOf(colName);
        if (colIndex !== -1) {
          const rule = SpreadsheetApp.newDataValidation().requireValueInList(config.validations[colName]).setAllowInvalid(false).build();
          sheet.getRange(2, colIndex + 1, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
        }
      }
      if (config.headers.length > 0) {
        config.headers.forEach((header, i) => sheet.autoResizeColumn(i + 1));
      }
    });

    ss.deleteSheet(ss.getSheetByName('TEMP'));

    // 4. Mettre en forme le tableau de bord
    setupDashboardSheet(ss.getSheetByName(SHEET_NAMES.DASHBOARD));

    // 4. Remplir l'onglet Configuration
    const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    const configData = [
      [CONFIG_KEYS.ADMIN_EMAIL, 'METTRE_VOTRE_EMAIL_ICI'],
      [CONFIG_KEYS.FRONTEND_URL, 'https://abmedupilote.abmcy.com/'],
      [CONFIG_KEYS.ADMIN_KEY, `admin-${Utilities.getUuid().substring(0, 8)}`] // Génère une clé admin par défaut
    ];
    configSheet.getRange(2, 1, configData.length, 2).setValues(configData);
    configSheet.autoResizeColumns(1, 2);

    // 5. Ajouter des données de démonstration pour les entités
    const univId = 'UNIV-DEMO';
    const adminId = 'ADM-DEMO';
    const demoSalt = Utilities.getUuid();
    const demoHashedPassword = hashPassword('password', demoSalt);
    ss.getSheetByName(SHEET_NAMES.UNIVERSITIES).getRange(2, 1, 1, 2).setValues([[univId, 'Université Virtuelle de Dakar']]);
    ss.getSheetByName(SHEET_NAMES.ADMINS).getRange(2, 1, 1, 5).setValues([[adminId, 'admin@demo.com', demoHashedPassword, demoSalt, univId]]);
    
    const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);
    const demoFilieres = [
        ['FIL-INFO', 'Informatique de Gestion', 'UNIV-DEMO', new Date()],
        ['FIL-DROIT', 'Droit des Affaires', 'UNIV-DEMO', new Date()]
    ];
    filieresSheet.getRange(2, 1, demoFilieres.length, demoFilieres[0].length).setValues(demoFilieres);

    const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
    const demoClasses = [
        ['CLS-L1INFO', 'L1-Info', 'FIL-INFO'],
        ['CLS-L1DROIT', 'L1-Droit', 'FIL-DROIT']
    ];
    classesSheet.getRange(2, 1, demoClasses.length, demoClasses[0].length).setValues(demoClasses);

    // 5. Ajouter des données de démonstration
    const planningSheet = ss.getSheetByName(SHEET_NAMES.PLANNING);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    // NOUVEAU: Ajouter des modules de démonstration
    const modulesSheet = ss.getSheetByName(SHEET_NAMES.MODULES);
    const demoModules = [
      ['MOD-ALGO', 'ALGO101 - Algorithmique', 'CLS-L1INFO', univId, 'Prof. Ba', 'En cours'],
      ['MOD-DROIT', 'DROIT101 - Introduction au Droit', 'CLS-L1DROIT', univId, 'Prof. Ndiaye', 'En cours'],
      ['MOD-BDD', 'BDD101 - Bases de données', 'CLS-L1INFO', univId, 'Prof. Sow', 'En cours']
    ];
    modulesSheet.getRange(2, 1, demoModules.length, demoModules[0].length).setValues(demoModules);

    const demoPlanning = [
      ['CRS-001', 'MOD-ALGO', today, '08:00', '10:00', 'Confirmé'],
      ['CRS-002', 'MOD-DROIT', today, '10:00', '12:00', 'Confirmé'],
      ['CRS-003', 'MOD-BDD', tomorrow, '08:00', '10:00', 'En attente']
    ];
    planningSheet.getRange(2, 1, demoPlanning.length, demoPlanning[0].length).setValues(demoPlanning);
    planningSheet.getRange('E:E').setNumberFormat('dd/mm/yyyy');
    planningSheet.getRange('F:G').setNumberFormat('hh"h"mm');
    planningSheet.autoResizeColumns(1, planningSheet.getLastColumn());

    const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
    const demoStudents = [
        ['ETU-DEMO1', 'Moussa Fall', 'FIL-INFO', 'CLS-L1INFO', 'm.fall@example.com', '771234567', univId, new Date()],
        ['ETU-DEMO2', 'Awa Diop', 'FIL-DROIT', 'CLS-L1DROIT', 'a.diop@example.com', '781234567', univId, new Date()]
    ];
    studentsSheet.getRange(2, 1, demoStudents.length, demoStudents[0].length).setValues(demoStudents);
    studentsSheet.getRange('F:F').setNumberFormat('dd/mm/yyyy hh:mm');
    studentsSheet.autoResizeColumns(1, studentsSheet.getLastColumn());

    // 6. Message final
    ui.alert(
      '🚀 Configuration Terminée !',
      'Votre système ABM EduPilote est prêt.\n\nProchaines étapes :\n1. Allez dans l\'onglet "Administrateurs" pour voir le compte démo (admin@demo.com / password).\n2. Déployez le script en tant qu\'application web si ce n\'est pas déjà fait.\n3. Utilisez le menu "ABM Gestion U" pour commencer.',
      ui.ButtonSet.OK
    );

  } catch (e) {
    Logger.log(e);
    ui.alert('Erreur lors de la configuration', e.message, ui.ButtonSet.OK);
  }
}

/**
 * NOUVEAU: Met à jour la structure du Google Sheet de manière non-destructive.
 * Ajoute les onglets et les colonnes manquants sans supprimer les données existantes.
 */
 function updateSystem() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ui = SpreadsheetApp.getUi();

    const response = ui.alert(
        'Confirmation de la Mise à Jour',
        'Cette action va vérifier et AJOUTER les onglets ou colonnes manquants pour assurer la compatibilité. Aucune donnée ou colonne ne sera supprimée. Voulez-vous continuer ?',
        ui.ButtonSet.YES_NO
    );

    if (response !== ui.Button.YES) {
        ui.alert('Mise à jour annulée.');
        return;
    }

    try {
        const sheetConfigs = getSheetConfigs();

        Object.entries(sheetConfigs).forEach(([name, config]) => {
            let sheet = ss.getSheetByName(name);
            if (!sheet) {
                sheet = ss.insertSheet(name);
                sheet.setTabColor(config.color);
                Logger.log(`Onglet '${name}' créé.`);
            }

            if (config.headers.length > 0) {
                const currentHeaders = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
                const missingHeaders = config.headers.filter(h => !currentHeaders.includes(h));

                if (missingHeaders.length > 0) {
                    const startColumn = sheet.getLastColumn() + 1;
                    sheet.getRange(1, startColumn, 1, missingHeaders.length).setValues([missingHeaders]);
                    Logger.log(`Colonnes manquantes ajoutées à '${name}': ${missingHeaders.join(', ')}`);
                }

                // Appliquer les validations de données (non destructif)
                if (config.validations) {
                    const updatedHeaders = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
                    for (const colName in config.validations) {
                        const colIndex = updatedHeaders.indexOf(colName);
                        if (colIndex !== -1) {
                            const rule = SpreadsheetApp.newDataValidation().requireValueInList(config.validations[colName]).setAllowInvalid(false).build();
                            sheet.getRange(2, colIndex + 1, sheet.getMaxRows() - 1, 1).setDataValidation(rule);
                            Logger.log(`Validation appliquée à la colonne '${colName}' dans '${name}'.`);
                        }
                    }
                }
             }
         });
 
         ui.alert('Mise à jour du système terminée avec succès ! Les onglets et colonnes manquants ont été ajoutés.');
     } catch (e) {
         Logger.log(e);
         ui.alert('Erreur lors de la mise à jour', e.message, ui.ButtonSet.OK);
     }
 }

/**
 * NOUVEAU: Fonction centralisée pour obtenir la configuration des feuilles.
 * @returns {object} La configuration complète des feuilles.
 */
function getSheetConfigs() {
    return {
        [SHEET_NAMES.DASHBOARD]: { headers: [], color: '#6a1b9a' },
        [SHEET_NAMES.CONFIG]: { headers: ['Clé', 'Valeur'], color: '#f4b400' },
        [SHEET_NAMES.UNIVERSITIES]: { headers: ['ID_UNIVERSITE', 'NOM_UNIVERSITE'], color: '#a61c00' },
        [SHEET_NAMES.FILIERES]: { headers: ['ID_FILIERE', 'NOM_FILIERE', 'ID_UNIVERSITE_FK', 'DATE_CREATION'], color: '#a61c00' },
        [SHEET_NAMES.CLASSES]: { headers: ['ID_CLASSE', 'NOM_CLASSE', 'ID_FILIERE_FK'], color: '#a61c00' },
        [SHEET_NAMES.RESPONSABLES]: { headers: ['ID_RESPONSABLE', 'NOM_RESPONSABLE', 'EMAIL_RESPONSABLE', 'PASSWORD_HASH', 'SALT', 'ID_CLASSE_FK', 'ID_UNIVERSITE_FK'], color: '#1a237e' },
        [SHEET_NAMES.ADMINS]: { headers: ['ID_ADMIN', 'EMAIL_ADMIN', 'PASSWORD_HASH', 'SALT', 'ID_UNIVERSITE_FK'], color: '#a61c00' },
        [SHEET_NAMES.PASSWORD_RESETS]: { headers: ['TIMESTAMP', 'EMAIL_ADMIN', 'STATUT'], color: '#ff6d00', validations: { 'STATUT': ['EN ATTENTE', 'TRAITÉ'] } }, // NOUVEAU: Ajout de NUMERO_TELEPHONE
        [SHEET_NAMES.MESSAGES]: { headers: ['ID_MESSAGE', 'TIMESTAMP', 'ID_UNIVERSITE_FK', 'ID_CLASSE_FK', 'SUJET', 'CORPS', 'AUTEUR_INFO'], color: '#00796b' },
        [SHEET_NAMES.STUDENTS]: { headers: ['ID_ETUDIANT', 'NOM_COMPLET', 'ID_FILIERE_FK', 'ID_CLASSE_FK', 'EMAIL', 'NUMERO_TELEPHONE', 'ID_UNIVERSITE_FK', 'DATE_INSCRIPTION', 'ID_RFID'], color: '#4285f4', validations: {} },
        [SHEET_NAMES.MESSAGE_READS]: { headers: ['ID_UTILISATEUR', 'ID_MESSAGE_FK', 'TIMESTAMP_LECTURE'], color: '#546e7a' },
        [SHEET_NAMES.MODULES]: { headers: ['ID_MODULE', 'NOM_MODULE', 'ID_CLASSE_FK', 'ID_UNIVERSITE_FK', 'NOM_ENSEIGNANT', 'STATUT'], color: '#fbc02d', validations: { 'STATUT': ['En cours', 'Terminé'] } },
        [SHEET_NAMES.PLANNING]: { headers: ['ID_COURS', 'ID_MODULE_FK', 'DATE_COURS', 'HEURE_DEBUT', 'HEURE_FIN', 'STATUT'], color: '#0f9d58', validations: { 'STATUT': ['Confirmé', 'Annulé', 'En attente'] } },
        [SHEET_NAMES.SCAN]: { headers: ['TIMESTAMP', 'ID_ETUDIANT', 'NOM_ETUDIANT', 'CLASSE', 'MODULE', 'DATE_SCAN', 'HEURE_SCAN', 'STATUT_PRESENCE'], color: '#db4437', validations: { 'STATUT_PRESENCE': ['Présent', 'Absent', 'En retard', 'Justifié'] } },
        [SHEET_NAMES.CONDUCT]: { headers: ['ID_INCIDENT', 'DATE', 'ID_ETUDIANT', 'NOM_ETUDIANT', 'CLASSE', 'DESCRIPTION_INCIDENT', 'MESURE_PRISE'], color: '#673ab7' },
        [SHEET_NAMES.ACTION_LOG]: { headers: ['TIMESTAMP', 'ACTION', 'DONNEES', 'UTILISATEUR_IP'], color: '#78909c' },
        [SHEET_NAMES.ERROR_LOG]: { headers: ['TIMESTAMP', 'ACTION', 'REQUETE', 'MESSAGE_ERREUR', 'SUGGESTION_DEBUG', 'PILE_APPEL'], color: '#d50000' }
        ,[SHEET_NAMES.AVIS]: { headers: ['TIMESTAMP', 'ROLE_UTILISATEUR', 'ID_UTILISATEUR', 'NOTES (Facilité, Design, Utilité)', 'POINTS_A_CORRIGER', 'IDEES_AMELIORATION', 'NOTE_ETOILEE'], color: '#ffc107' }
    };
}

/**
 * NOUVEAU : Crée une réponse standard au format JSON pour l'API.
 */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}


// --- TOUTES LES AUTRES FONCTIONS (onOpen, createDailyForms, processFormResponse, etc.) RESTENT IDENTIQUES ---
// (Le code complet est inclus ci-dessous pour éviter toute confusion)

function onOpen() {
  // NOUVEAU: Vérifier et ajouter les colonnes manquantes à l'ouverture.
  checkAndAddMissingColumns();

  SpreadsheetApp.getUi()
    .createMenu('ABM Gestion U')

    .addItem('1. Initialiser le Système (Setup)', 'setup')
    .addItem('Rafraîchir le Tableau de Bord', 'updateDashboardSheet') // NOUVEAU
    .addItem('Mettre à jour le Système', 'updateSystem') // NOUVEAU
    .addSeparator()
    .addItem('Exporter des Données', 'showExportDialog') // NOUVEAU
    .addSeparator()
    .addItem('Générer les URLs des QR Codes', 'generateQrCodeUrls')
    .addItem('Générer les liens d\'inscription', 'generateRegistrationLinks')
    .addToUi();
}

/**
 * NOUVEAU: Vérifie si des colonnes essentielles manquent et les ajoute.
 * Cette fonction est non-destructive et peut être exécutée sans risque sur des données existantes.
 */
function checkAndAddMissingColumns() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
    if (!studentsSheet) return; // L'onglet n'existe pas, le setup est nécessaire.

    const headers = studentsSheet.getRange(1, 1, 1, studentsSheet.getLastColumn()).getValues()[0];
    
    // Vérification de la colonne NUMERO_TELEPHONE
    if (!headers.includes('NUMERO_TELEPHONE')) {
      const emailIdx = headers.indexOf('EMAIL');
      if (emailIdx !== -1) {
        // Insérer la colonne juste après la colonne EMAIL
        studentsSheet.insertColumnAfter(emailIdx + 1);
        studentsSheet.getRange(1, emailIdx + 2).setValue('NUMERO_TELEPHONE');
        Logger.log('Colonne "NUMERO_TELEPHONE" ajoutée avec succès.');
      } else {
        // Si la colonne EMAIL n'est pas trouvée, on l'ajoute à la fin comme solution de secours.
        studentsSheet.getRange(1, headers.length + 1).setValue('NUMERO_TELEPHONE');
        Logger.log('Colonne "NUMERO_TELEPHONE" ajoutée à la fin (colonne EMAIL non trouvée).');
      }
    }
  } catch (e) {
    Logger.log(`Erreur lors de la vérification des colonnes : ${e.message}`);
  }
}

function getConfiguration() {
  const configSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CONFIG);
  if (!configSheet) return {};
  const data = configSheet.getDataRange().getValues();
  data.shift();
  const config = {};
  data.forEach(row => { if (row[0] && row[1]) { config[row[0]] = row[1]; } });
  return config;
}

function generateQrCodeUrls() {
  try {
    const ui = SpreadsheetApp.getUi();
    const result = ui.prompt(
        'Génération des QR Codes',
        'Veuillez entrer l\'ID de l\'université (ex: UNIV-DEMO) :',
        ui.ButtonSet.OK_CANCEL);

    // Traiter la réponse de l'utilisateur.
    if (result.getSelectedButton() == ui.Button.OK) {
      const universityId = result.getResponseText();
      if (!universityId) {
          ui.alert('L\'ID de l\'université ne peut pas être vide.');
          return;
        }
      const htmlContent = generateQrCodeUrlsLogic(universityId.trim());
      const htmlOutput = HtmlService.createHtmlOutput(htmlContent).setWidth(600).setHeight(500);
      ui.showModalDialog(htmlOutput, 'Générateur d\'URLs pour QR Codes');
    }
  } catch (error) {
    logError('generateQrCodeUrls_menu', error);
    SpreadsheetApp.getUi().alert(`Erreur: ${error.message}`);
  }
}

// ============================================================================
// FONCTIONS POUR L'INTERFACE ADMIN (appelées par doPost)
// ============================================================================

/**
 * NOUVEAU: Version de generateQrCodeUrls pour l'interface admin HTML.
 * Renvoie une réponse JSON avec le contenu HTML.
 */
function generateQrCodeUrlsForAdmin(data) {
  try {
    const htmlContent = generateQrCodeUrlsLogic(data.universityId);
    return createJsonResponse({ success: true, html: htmlContent });
  } catch (error) {
    logError('adminGetQrCodes', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: Version de generateRegistrationLinks pour l'interface admin HTML.
 * Renvoie une réponse JSON avec le contenu HTML.
 */
function generateRegistrationLinksForAdmin(data) {
  try {
    const htmlContent = generateRegistrationLinksLogic(data.universityId);
    return createJsonResponse({ success: true, html: htmlContent });
  } catch (error) {
    logError('adminGetRegLinks', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

// ============================================================================
// LOGIQUE MÉTIER REFACTORISÉE (pour être appelée par les deux interfaces)
// ============================================================================

/**
 * NOUVEAU: Logique de génération des QR codes, renvoie le HTML.
 */
function generateQrCodeUrlsLogic(universityId) {
  const config = getConfiguration();
  const frontendUrl = config.FRONTEND_URL;

  if (!frontendUrl || frontendUrl.includes('METTRE_URL')) {
    throw new Error("L'URL du frontend n'est pas configurée. Veuillez l'ajouter dans l'onglet Configuration.");
  }
  if (!universityId) {
    throw new Error("ID de l'université manquant pour générer les liens.");
  }

  const allowedFiliereIds = getFiliereIdsForUniversity(universityId);
  const classesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CLASSES);
  const classesData = classesSheet.getDataRange().getValues();
  const classesHeaders = classesData.shift();
  const classes = classesData
      .filter(row => allowedFiliereIds.includes(row[classesHeaders.indexOf('ID_FILIERE_FK')]))
      .map(row => ({ id: row[classesHeaders.indexOf('ID_CLASSE')], name: row[classesHeaders.indexOf('NOM_CLASSE')] }));

  let htmlContent = '<h2>URLs pour les QR Codes des salles</h2><div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px;">';
  classes.forEach((classe, index) => {
    const fullUrl = `${frontendUrl}?page=attendance&classe=${encodeURIComponent(classe.name)}`;
    const qrCodeApiUrl = `https://quickchart.io/qr?text=${encodeURIComponent(fullUrl)}&size=250&ecLevel=H&margin=2`;
    htmlContent += `
      <div style="border: 1px solid #ccc; padding: 15px; border-radius: 8px; text-align: center;">
        <b>Salle : ${classe.name}</b><br>
        <img src="${qrCodeApiUrl}" alt="QR Code pour ${classe.name}" style="width: 100%; max-width: 250px; margin: 10px auto; border-radius: 4px;"><br>
        <div style="display: flex; justify-content: center; gap: 10px; margin-top: 10px;">
          <button data-action="download" data-url="${qrCodeApiUrl}" data-filename="qr-code-${classe.name}.png" style="padding: 8px 12px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 4px; border: none; cursor: pointer;">Télécharger</button>
          <button data-action="share" data-url="${qrCodeApiUrl}" data-title="QR Code pour ${classe.name}" data-filename="qr-code-${classe.name}.png" style="padding: 8px 12px; background-color: #008CBA; color: white; border: none; border-radius: 4px; cursor: pointer;">Partager</button>
        </div>
      </div>`;
  });
  htmlContent += '</div>';
  return htmlContent;
}

/**
 * NOUVEAU: Logique de génération des liens d'inscription, renvoie le HTML.
 */
function generateRegistrationLinksLogic(universityId) {
  const config = getConfiguration();
  const frontendUrl = config.FRONTEND_URL;

  if (!frontendUrl || frontendUrl.includes('METTRE_URL')) {
    throw new Error("L'URL du frontend n'est pas configurée. Veuillez l'ajouter dans l'onglet Configuration.");
  }
  if (!universityId) {
    throw new Error("ID de l'université manquant pour générer les liens.");
  }

  const allowedFiliereIds = getFiliereIdsForUniversity(universityId);
  const classesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CLASSES);
  const classesData = classesSheet.getDataRange().getValues();
  const classesHeaders = classesData.shift();
  const classes = classesData
      .filter(row => allowedFiliereIds.includes(row[classesHeaders.indexOf('ID_FILIERE_FK')]))
      .map(row => ({ id: row[classesHeaders.indexOf('ID_CLASSE')], name: row[classesHeaders.indexOf('NOM_CLASSE')] }));

  let htmlContent = '<h2>Liens d\'inscription par classe (Prêts à partager !)</h2><p>Partagez le lien correspondant à la classe pour que les étudiants soient automatiquement assignés.</p><ul>';
  classes.forEach((classe, index) => {
    const registrationLink = `${frontendUrl}?page=class-register&universityId=${encodeURIComponent(universityId)}&classId=${encodeURIComponent(classe.id)}`;
    htmlContent += `
      <li style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
        <b>Classe : ${classe.name}</b><br>
        <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
          <input type="text" id="link-input-${index}" value="${registrationLink}" readonly style="width:100%; flex-grow: 1; padding: 8px;">
          <button data-action="copy-link" data-target="link-input-${index}" style="padding: 8px 12px; background-color: #f44336; color: white; border: none; border-radius: 4px; cursor: pointer;">Copier</button>
          <button data-action="share-link" data-url="${registrationLink}" data-title="Lien d'inscription pour ${classe.name}" style="padding: 8px 12px; background-color: #008CBA; color: white; border: none; border-radius: 4px; cursor: pointer;">Partager</button>
        </div>
      </li>`;
  });

  htmlContent += '</ul>';
  return htmlContent;
}

function getSheetNameForEntity(entityType) {
  const map = {
    university: SHEET_NAMES.UNIVERSITIES,
    filiere: SHEET_NAMES.FILIERES,
    classe: SHEET_NAMES.CLASSES,
    responsable: SHEET_NAMES.RESPONSABLES,
    student: SHEET_NAMES.STUDENTS,
    module: SHEET_NAMES.MODULES // CORRECTION: Ajouter le type 'module'
  };

  const sheetName = map[entityType];
  if (!sheetName) throw new Error(`Type d'entité inconnu: ${entityType}`);
  return sheetName;
}

/**
 * NOUVEAU : Fonction utilitaire pour récupérer les IDs de filière pour une université donnée.
 * Centralise la logique pour éviter la duplication de code.
 */
function getFiliereIdsForUniversity(universityId) {
    const cacheKey = `filiere_ids_${universityId}`;
    return getCachedData(cacheKey, () => {
        const filieresSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.FILIERES);
        const filieresData = filieresSheet.getDataRange().getValues();
        const filieresHeaders = filieresData.shift();
        const univFkIdx = filieresHeaders.indexOf('ID_UNIVERSITE_FK');
        const filiereIdIdx = filieresHeaders.indexOf('ID_FILIERE');

        if (univFkIdx === -1 || filiereIdIdx === -1) throw new Error("Colonnes 'ID_UNIVERSITE_FK' ou 'ID_FILIERE' introuvables.");

        return filieresData.filter(row => row[univFkIdx] === universityId).map(row => row[filiereIdIdx]);
    }, 600); // Cache de 10 minutes
}

/**
 * NOUVEAU: Fonctions utilitaires pour le cache.
 */
const cache = CacheService.getScriptCache();

/**
 * Récupère des données depuis le cache ou, si absentes, les génère via une fonction,
 * puis les met en cache.
 * @param {string} key - La clé unique pour le cache.
 * @param {function} fallbackFunction - La fonction à exécuter pour obtenir les données si le cache est vide.
 * @param {number} expirationInSeconds - La durée de vie du cache en secondes.
 * @returns {*} Les données (depuis le cache ou fraîchement générées).
 */
function getCachedData(key, fallbackFunction, expirationInSeconds = 600) { // 10 minutes par défaut
  const cached = cache.get(key);
  if (cached != null) {
    return JSON.parse(cached);
  }
  const data = fallbackFunction();
  if (data) {
    cache.put(key, JSON.stringify(data), expirationInSeconds);
  }
  return data;
}

function clearStudentCache() {
    cache.remove('student_id_map');
}
/**
 * NOUVEAU: Crée et met en cache une map des étudiants pour des recherches rapides.
 * @returns {Object} Une map où les clés sont les ID des étudiants.
 */
function getStudentMap() {
    const cacheKey = 'all_students_map';
    return getCachedData(cacheKey, () => {
        const studentsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.STUDENTS);
        const studentsData = studentsSheet.getDataRange().getValues();
        const headers = studentsData.shift();
        const idIdx = headers.indexOf('ID_ETUDIANT');
        const nameIdx = headers.indexOf('NOM_COMPLET');
        const classIdx = headers.indexOf('ID_CLASSE_FK');
        const univIdx = headers.indexOf('ID_UNIVERSITE_FK');

        const map = {};
        studentsData.forEach(row => {
            const id = row[idIdx] ? row[idIdx].toString().trim().toUpperCase() : null;
            if (id) {
                map[id] = { name: row[nameIdx], classId: row[classIdx], universityId: row[univIdx] };
            }
        });
        return map;
    }, 300); // Cache de 5 minutes
}

/**
 * NOUVEAU: Force la suppression de tous les caches pour une université.
 */
function adminForceRefresh(data) {
    try {
        const { universityId } = data;
        if (!universityId) throw new Error("ID Université manquant.");

        // CORRECTION: Remplacer l'appel à la fonction inexistante par la logique directe.
        const keysToRemove = [
            `entities_filiere_${universityId}`, `filiere_ids_${universityId}`,
            `entities_classe_${universityId}`,
            `responsables_${universityId}`,
            `students_${universityId}`,
            `planning_${universityId}`,
            `dashboard_stats_${universityId}`,
            `attendance_stats_${universityId}`,
            `attendance_${universityId}`
        ];
        Logger.log(`Invalidating admin caches for ${universityId}: ${keysToRemove.join(', ')}`);
        cache.removeAll(keysToRemove);
        
        logAction('adminForceRefresh', { universityId });
        return createJsonResponse({ success: true, message: "Les données sont en cours de mise à jour. Cela peut prendre un instant." });
    } catch (error) {
        logError('adminForceRefresh', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * AMÉLIORÉ: Invalide les caches spécifiés pour une université.
 * Centralise la logique d'invalidation pour éviter les erreurs.
 * @param {string} universityId - L'ID de l'université concernée.
 * @param {Array<string>} types - Un tableau des types de cache à invalider.
 * Ex: ['filiere', 'classe', 'planning', 'dashboard', 'responsable', 'student']
 */
function clearAllCachesForUniversity(universityId, types = []) {
    const keysToRemove = new Set();

    types.forEach(type => {
        switch (type) {
            case 'filiere':
                keysToRemove.add(`entities_filiere_${universityId}`);
                keysToRemove.add(`filiere_ids_${universityId}`); // CORRECTION: Vider le cache des IDs de filières
                break;
            case 'classe': keysToRemove.add(`entities_classe_${universityId}`); break;
            case 'responsable':
                keysToRemove.add(`entities_responsable_${universityId}`);
                keysToRemove.add(`responsables_${universityId}`);
                break;
            case 'student': keysToRemove.add(`students_${universityId}`); break;
            case 'planning': keysToRemove.add(`planning_${universityId}`); break;
            case 'dashboard': keysToRemove.add(`dashboard_stats_${universityId}`); break;
            case 'stats': keysToRemove.add(`attendance_stats_${universityId}`); break; // NOUVEAU
            case 'attendance': keysToRemove.add(`attendance_${universityId}`); break; // NOUVEAU
        }
        // NOUVEAU: Invalidation des caches liés aux modules
        keysToRemove.add(`modules_resp_${universityId}`); // Cache spécifique au responsable
        keysToRemove.add(`entities_module_${universityId}`); // Cache général des modules pour l'admin
    });

    const keysArray = Array.from(keysToRemove); // Convertir le Set en Array
    Logger.log(`Invalidating caches for ${universityId}: ${keysArray.join(', ')}`);
    if (keysArray.length > 0) cache.removeAll(keysArray); // Utiliser le Array
}

/**
 * NOUVEAU: Enregistre une action réussie dans l'onglet d'historique.
 * @param {string} actionName - Le nom de l'action effectuée.
 * @param {object} data - Les données associées à l'action.
 */
function logAction(actionName, data) {
  try {
    const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ACTION_LOG);
    if (logSheet) {
      const userIp = "N/A"; // L'IP n'est pas directement accessible dans Apps Script
      logSheet.appendRow([
        new Date(),
        actionName,
        JSON.stringify(data),
        userIp
      ]);
    }
  } catch (e) {
    Logger.log(`Échec de l'enregistrement de l'action: ${e.toString()}`);
  }
}

/**
 * AMÉLIORÉ: Enregistre une erreur dans l'onglet d'historique avec une suggestion de débogage.
 * @param {string} requestContent - Le contenu brut de la requête qui a échoué.
 * @param {Error} error - L'objet erreur.
 */
function logError(requestContent, error) {
  try {
    let action = 'inconnue';
    let requestData = requestContent;
    try {
        const parsedRequest = JSON.parse(requestContent);
        action = parsedRequest.action || 'inconnue';
        requestData = JSON.stringify(parsedRequest.data, null, 2); // Formatter pour la lisibilité
    } catch(e) { /* Ignorer si le parsing échoue */ }
    const errorSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.ERROR_LOG);
    const suggestion = getDebugSuggestion(error, requestContent);
    if (errorSheet) {
      errorSheet.appendRow([new Date(), action, requestData, error.message, suggestion, error.stack]);
    }
  } catch (e) {
    Logger.log(`Échec de l'enregistrement de l'erreur: ${e.toString()}`);
  }
}

/**
 * NOUVEAU: Analyse une erreur et fournit une suggestion de débogage.
 * @param {Error} error - L'objet erreur.
 * @param {string} requestContent - Le contenu de la requête.
 * @returns {string} Une suggestion textuelle pour aider à résoudre l'erreur.
 */
function getDebugSuggestion(error, requestContent) {
  const errorMessage = error.message.toLowerCase();

  if (errorMessage.includes('is not defined')) {
    const varName = errorMessage.match(/'([^']*)' is not defined/)?.[1] || errorMessage.split(' ')[0];
    return `CAUSE: La variable ou fonction '${varName}' n'est pas définie.\nSOLUTION: Assurez-vous que la variable est bien déclarée (avec 'const' ou 'let') ou que la fonction est correctement nommée et définie avant son appel.`;
  }
  if (errorMessage.includes('action non reconnue')) {
    let action = 'inconnue';
    try { action = JSON.parse(requestContent).action; } catch(e) {}
    return `CAUSE: L'action '${action}' envoyée par le frontend n'est pas gérée par le backend.\nSOLUTION: Dans la fonction 'doPost', ajoutez une condition 'else if (action === "${action}") { ... }' pour router la requête vers la bonne fonction.`;
  }
  if (errorMessage.includes('données manquantes') || errorMessage.includes('manquant')) {
    return `CAUSE: Le frontend n'a pas envoyé toutes les données nécessaires à l'API.\nSOLUTION: Dans le fichier HTML (ex: etudiant.html), vérifiez le code JavaScript qui appelle l'API ('callApi' ou 'callAdminApi') et assurez-vous que tous les paramètres requis sont bien inclus dans l'objet 'data'.`;
  }
  if (errorMessage.includes('cannot read propert') && (errorMessage.includes('of null') || errorMessage.includes('of undefined'))) {
    return `CAUSE: Le script a essayé de lire une propriété sur une valeur 'null' ou 'undefined'. Cela arrive souvent quand une recherche (ex: .find()) ne trouve rien.\nSOLUTION: Ajoutez une vérification juste après la recherche pour gérer le cas où aucun résultat n'est trouvé. Par exemple : 'if (!resultat) { throw new Error("Élément non trouvé.") }'.`;
  }
  if (errorMessage.includes('permission')) {
    return `CAUSE: Le script n'a pas les autorisations nécessaires pour effectuer une action (ex: modifier une feuille protégée).\nSOLUTION: Vérifiez les autorisations du script dans les paramètres du projet Apps Script et les protections sur les feuilles Google Sheets.`;
  }
  if (errorMessage.includes('cache')) {
    return `CAUSE: Un problème est survenu avec le système de cache (CacheService).\nSOLUTION: Cela peut être une erreur temporaire de Google. Si le problème persiste, vérifiez que les clés de cache sont valides et que les données mises en cache ne dépassent pas la taille limite.`;
  }
  if (errorMessage.includes('colonnes manquantes') || errorMessage.includes('introuvable dans l\'onglet')) {
    return `CAUSE: Une colonne a été renommée ou supprimée dans le Google Sheet, ou un onglet est manquant.\nSOLUTION: NE PAS RENOMMER les en-têtes de colonnes. Vérifiez que les noms des colonnes et des onglets correspondent exactement à ceux définis dans la constante 'SHEET_NAMES' au début du script.`;
  }
  if (errorMessage.includes('temps d\'exécution maximal')) {
    return `CAUSE: Le script a mis trop de temps à s'exécuter (limite de Google dépassée).\nSOLUTION: La fonction concernée est trop lente. Optimisez-la en utilisant le cache ('getCachedData') pour les données qui ne changent pas souvent, ou en réduisant le nombre de lectures/écritures dans la boucle.`;
  }
  if (errorMessage.includes('accès non autorisé')) {
    return `CAUSE: Une tentative d'accès à des données non autorisées a été bloquée (ex: un admin essayant de voir les données d'une autre université).\nSOLUTION: C'est un comportement de sécurité normal. L'erreur est attendue si l'action est illégitime. Vérifiez que les IDs (universityId, responsableId) sont corrects.`;
  }
  if (errorMessage.includes('invalid')) {
    return `CAUSE: Une donnée envoyée est invalide (ex: format de date, ID incorrect).\nSOLUTION: Vérifiez les données envoyées dans la colonne 'REQUETE' du journal d'erreurs et assurez-vous qu'elles sont dans le bon format.`;
  }

  return "Pas de suggestion automatique pour cette erreur. Analysez le message d'erreur et la pile d'appel pour plus de détails.";
}

/**
 * NOUVEAU: Hashe un mot de passe avec un sel (salt).
 * @param {string} password - Le mot de passe en clair.
 * @param {string} salt - La chaîne de caractères unique pour le salage.
 * @returns {string} Le mot de passe haché en hexadécimal.
 */
function hashPassword(password, salt) {
  const toHash = password + salt;
  const hashBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, toHash);
  return hashBytes.map(byte => {
    const hex = (byte & 0xFF).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/**
 * NOUVEAU: Vérifie si un mot de passe en clair correspond à un hash stocké.
 * @param {string} password - Le mot de passe en clair à vérifier.
 * @param {string} storedHash - Le hash stocké dans la base de données.
 * @param {string} salt - Le sel associé au hash stocké.
 * @returns {boolean} Vrai si les mots de passe correspondent, sinon faux.
 */
function verifyPassword(password, storedHash, salt) {
  const newHash = hashPassword(password, salt);
  return newHash === storedHash;
}

/**
 * NOUVEAU: Récupère un profil étudiant complet pour l'administrateur.
 */
function getStudentProfileForAdmin(data) {
    try {
        const { studentId, universityId } = data;
        if (!studentId || !universityId) {
            throw new Error("Données manquantes pour récupérer le profil étudiant.");
        }

        // Le cache est spécifique à l'étudiant et à l'université pour la sécurité
        const cacheKey = `profile_basic_admin_${studentId}_${universityId}`;
        
        const profile = getCachedData(cacheKey, () => {
            const ss = SpreadsheetApp.getActiveSpreadsheet();

            // 1. Get student basic info
            const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
            const studentsData = studentsSheet.getDataRange().getValues();
            const studentsHeaders = studentsData.shift();
            const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
            const studentRow = studentsData.find(row => row[studentIdIdx] === studentId);
            if (!studentRow) throw new Error("Étudiant non trouvé.");

            const student = {};
            studentsHeaders.forEach((header, i) => student[header] = studentRow[i]);
            
            // Security check
            if (student.ID_UNIVERSITE_FK !== universityId) {
                throw new Error("Accès non autorisé à cet étudiant.");
            }

            // 2. Get class and filiere names
            const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
            const classesData = classesSheet.getDataRange().getValues();
            const classRow = classesData.find(row => row[0] === student.ID_CLASSE_FK);
            student.NOM_CLASSE = classRow ? classRow[1] : 'N/A';

            const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);
            const filieresData = filieresSheet.getDataRange().getValues();
            const filiereRow = filieresData.find(row => row[0] === student.ID_FILIERE_FK);
            student.NOM_FILIERE = filiereRow ? filiereRow[1] : 'N/A';

            // Le frontend récupère l'historique et l'emploi du temps séparément.
            // On ne renvoie que les informations de base de l'étudiant.
            return { student };
        }, 600); // Cache de 10 minutes pour les infos de base

        return createJsonResponse({ success: true, data: profile });

    } catch (error) {
        logError('getStudentProfileForAdmin', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Fonction interne pour trouver l'historique de présence d'un étudiant.
 * Cette fonction est réutilisable et peut être appelée par d'autres fonctions du backend.
 * @param {string} studentId - L'ID de l'étudiant à rechercher.
 * @returns {Array} Un tableau d'objets représentant les enregistrements de présence.
 */
function findStudentAttendance(studentId) {
    if (!studentId) return []; // Retourne un tableau vide si aucun ID n'est fourni

    const scanSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
    const scanData = scanSheet.getDataRange().getValues();
    const headers = scanData.shift();
    const studentIdIdx = headers.indexOf('ID_ETUDIANT');

    if (studentIdIdx === -1) {
        logError('findStudentAttendance', new Error('La colonne ID_ETUDIANT est introuvable dans l\'onglet SCAN.'));
        return []; // Retourne un tableau vide en cas d'erreur de configuration
    }

    return scanData
        .filter(row => row[studentIdIdx] && row[studentIdIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase())
        .map(row => {
            const record = {};
            headers.forEach((header, i) => record[header] = row[i]);
            return record;
        }).sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP)); // Trier par date la plus récente en premier
}

/**
 * NOUVEAU: Fonction interne pour trouver l'emploi du temps d'un étudiant.
 * @param {string} studentId - L'ID de l'étudiant.
 * @returns {Array} Un tableau d'objets représentant les cours.
 */
function findStudentSchedule(studentId) {
    if (!studentId) return [];

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
    const planningSheet = ss.getSheetByName(SHEET_NAMES.PLANNING);

    // 1. Trouver la classe de l'étudiant
    const studentsData = studentsSheet.getDataRange().getValues();
    const studentsHeaders = studentsData.shift();
    const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
    const classFkIdx = studentsHeaders.indexOf('ID_CLASSE_FK');
    const studentRow = studentsData.find(row => row[studentIdIdx] && row[studentIdIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase());
    if (!studentRow) return []; // Étudiant non trouvé, retourne un planning vide
    const classId = studentRow[classFkIdx];
    if (!classId) return [];

    // 2. Récupérer les modules de cette classe
    const modulesSheet = ss.getSheetByName(SHEET_NAMES.MODULES);
    const modulesData = modulesSheet.getDataRange().getValues();
    const modulesHeaders = modulesData.shift();
    const modClassFkIdx = modulesHeaders.indexOf('ID_CLASSE_FK');
    const modIdIdx = modulesHeaders.indexOf('ID_MODULE');
    const moduleIdsForClass = new Set(
        modulesData.filter(row => row[modClassFkIdx] === classId).map(row => row[modIdIdx])
    );

    // 3. Récupérer le planning pour ces modules
    const planningData = planningSheet.getDataRange().getValues();
    const planningHeaders = planningData.shift();
    const moduleIdFkIdx = planningHeaders.indexOf('ID_MODULE_FK');

    // Enrichir avec les infos du module (comme dans getPlanningForAdmin)
    const moduleMap = new Map(modulesData.map(row => [row[modIdIdx], { name: row[modulesHeaders.indexOf('NOM_MODULE')], teacher: row[modulesHeaders.indexOf('NOM_ENSEIGNANT')] }]));

    return planningData
        .filter(row => moduleIdsForClass.has(row[moduleIdFkIdx]))
        .map(row => {
            const course = Object.fromEntries(planningHeaders.map((header, i) => [header, row[i]]));
            const moduleInfo = moduleMap.get(course.ID_MODULE_FK);
            course.MODULE = moduleInfo ? moduleInfo.name : 'Module Inconnu';
            course.ENSEIGNANT = moduleInfo ? moduleInfo.teacher : 'N/A';
            return course;
        })
        .sort((a, b) => new Date(a.DATE_COURS) - new Date(b.DATE_COURS));
}
/**
 * NOUVEAU: Récupère l'historique de présence d'un étudiant.
 */
function getStudentAttendanceHistory(data) {
    const { studentId } = data;
    if (!studentId) return createJsonResponse({ success: false, error: 'ID Étudiant manquant.' });

    // Le cache est spécifique à l'étudiant.
    const cacheKey = `attendance_history_${studentId}`;
    try {
        const history = getCachedData(cacheKey, () => {
            // CORRECTION: Logique inlinée pour éviter les problèmes de scope avec "findStudentAttendance".
            const scanSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
            const scanData = scanSheet.getDataRange().getValues();
            const headers = scanData.shift();
            const studentIdIdx = headers.indexOf('ID_ETUDIANT');

            if (studentIdIdx === -1) return [];

            return scanData
                .filter(row => row[studentIdIdx] && row[studentIdIdx].toString().trim().toUpperCase() === studentId.trim().toUpperCase())
                .map(row => {
                    const record = {};
                    headers.forEach((header, i) => record[header] = row[i]);
                    return record;
                })
                .sort((a, b) => new Date(b.TIMESTAMP) - new Date(a.TIMESTAMP));
        }, 300); // Cache de 5 minutes pour l'historique

        return createJsonResponse({ success: true, data: history });
    } catch (error) {
        logError('getStudentAttendanceHistory', error);
        return createJsonResponse({ success: false, error: `Erreur interne: ${error.message}` });
    }
}

/**
 * NOUVEAU: Exporte des données et sauvegarde le fichier CSV dans Google Drive.
 * Appelée depuis la barre latérale du Google Sheet.
 */
function exportDataToDrive(data) {
  try {
    const { universityId, exportType } = data;
    if (!universityId || !exportType) {
      throw new Error("ID Université et type d'export sont requis.");
    }

    // Réutiliser la logique de `exportDataForAdmin` mais sans la partie réponse HTTP
    const exportResult = exportDataForAdmin({ universityId, exportType });
    const resultData = JSON.parse(exportResult.getContent());

    if (!resultData.success) {
      throw new Error(resultData.error);
    }

    const { csvContent, fileName } = resultData.data;

    // Trouver ou créer le dossier d'export
    const folderName = "Exports_ABM_EduPilote";
    let folder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
    }

    // Créer le fichier CSV
    const file = folder.createFile(fileName, csvContent, MimeType.CSV);

    logAction('exportDataToDrive', { universityId, exportType, fileName: file.getName() });

    // Renvoyer le lien du fichier pour l'afficher dans la sidebar
    return { success: true, message: `Fichier '${file.getName()}' créé avec succès.`, url: file.getUrl() };

  } catch (error) {
    logError('exportDataToDrive', error);
    // Renvoyer l'erreur à la sidebar
    return { success: false, error: error.message };
  }
}

/**
 * NOUVEAU: Récupère la liste des universités pour la barre latérale.
 */
function getUniversitiesList() {
    try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const universitiesSheet = ss.getSheetByName(SHEET_NAMES.UNIVERSITIES);
        const univData = universitiesSheet.getRange(2, 1, universitiesSheet.getLastRow() - 1, 2).getValues();
        const universities = univData.map(row => ({ id: row[0], name: row[1] }));
        return universities;
    } catch (error) {
        logError('getUniversitiesList', error);
        return []; // Renvoyer un tableau vide en cas d'erreur
    }
}

/**
 * NOUVEAU: Exporte des données (filières, classes, présences) au format CSV.
 */
function exportDataForAdmin(data) {
    try {
        const { universityId, exportType, classId, className } = data;
        if (!universityId || !exportType) {
            throw new Error("Données d'exportation manquantes.");
        }

        let headers = [];
        let rows = [];
        let fileName = `${exportType}_${universityId}_${new Date().toISOString().split('T')[0]}.csv`;

        let resultData;
        switch (exportType) {
            case 'filieres':
                resultData = getEntitiesForAdmin({ entityType: 'filiere', universityId }).data;
                break;
            case 'classes':
                resultData = getEntitiesForAdmin({ entityType: exportType, universityId }).data;
                break;
            case 'students':
            case 'students_all': // Alias pour la compatibilité
                resultData = getStudentsForAdmin({ universityId }).data;
                break;
            case 'attendance_all':
                resultData = getAttendanceForAdmin({ universityId }).data;
                break;
            case 'students_class':
                if (!classId) throw new Error("ID de la classe manquant pour l'exportation des étudiants.");
                resultData = getStudentsByClassForAdmin({ universityId, classId }).data;
                fileName = `etudiants_${className.replace(/\s/g, '_')}.csv`;
                break;
            default:
                throw new Error("Type d'exportation non reconnu.");
        }

        if (resultData && resultData.length > 0) {
            headers = Object.keys(resultData[0]);
            rows = resultData.map(item => headers.map(header => item[header]));
        }

        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${(cell != null ? cell.toString() : '').replace(/"/g, '""')}"`).join(','))].join('\n');
        return createJsonResponse({ success: true, data: { csvContent, fileName } });

    } catch (error) {
        logError('exportDataForAdmin', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Enregistre la présence d'un étudiant en scannant son ID.
 * Utilisé par les responsables et les administrateurs.
 * @param {object} data - Contient { studentId }.
 */
function scanStudentForAttendance(data, ctx) {
  try {
    const { studentId } = data;
    if (!studentId) {
      throw new Error("ID de l'étudiant manquant dans la requête.");
    }

    // 1. Trouver les informations de l'étudiant (nom, nom de la classe)
    const studentMap = getStudentMap();
    const studentInfo = studentMap[studentId.trim().toUpperCase()];
    if (!studentInfo) {
      throw new Error(`Étudiant avec l'ID ${studentId} non trouvé.`);
    }
    const classId = studentInfo.classId;
    if (!classId) {
      throw new Error(`L'étudiant ${studentInfo.name} n'est assigné à aucune classe.`);
    }
    
    // Récupérer le nom de la classe à partir de son ID
    const classesData = ctx.classes || SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.CLASSES).getDataRange().getValues();
    const classRow = classesData.slice(1).find(row => row[0] === classId);
    const className = classRow ? classRow[1] : null;

    if (!className) {
      throw new Error(`Impossible de trouver le nom de la classe pour l'ID ${classId}.`);
    }

    // 2. Trouver le cours actuel pour cette classe
    // On simule un appel à getCurrentCourse
    const courseResponse = getCurrentCourse({ classe: className });
    const courseResult = JSON.parse(courseResponse.getContent());
    if (!courseResult.success) {
      throw new Error(courseResult.error);
    }
    const module = courseResult.data.module;

    // 3. Enregistrer la présence (similaire à recordAttendance)
    return recordAttendance({ studentId, classe: className, module });

  } catch (error) {
    logError('scanStudentForAttendance', error);
    return createJsonResponse({ success: false, error: error.message });
  }
}

/**
 * NOUVEAU: ACTION: responsableMarkOnlineAttendance
 * Enregistre la présence pour plusieurs étudiants cochés lors d'un cours en ligne.
 * @param {object} data - Contient { responsableId, universityId, courseId, studentIds }.
 * @param {object} ctx - Le contexte de la requête.
 * @returns {object} JSON response avec un message de succès.
 */
function responsableMarkOnlineAttendance(data, ctx) {
    try {
        const { responsableId, courseId, studentIds } = data;
        if (!responsableId || !courseId || !studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
            throw new Error("Données incomplètes pour le pointage en ligne.");
        }

        // 1. Vérification de sécurité et récupération des informations
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const { classId, className } = classInfo;

        const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
        const planningHeaders = planningData[0];
        const p_courseIdIdx = planningHeaders.indexOf('ID_COURS');
        const p_moduleIdFkIdx = planningHeaders.indexOf('ID_MODULE_FK');
        const courseRow = planningData.slice(1).find(row => row[p_courseIdIdx] === courseId);
        if (!courseRow) throw new Error("Cours non trouvé.");

        const moduleId = courseRow[p_moduleIdFkIdx];
        const moduleMap = new Map(_getRawSheetData(SHEET_NAMES.MODULES, ctx).slice(1).map(row => [row[0], { name: row[1], classId: row[2] }]));
        const moduleInfo = moduleMap.get(moduleId);

        if (!moduleInfo || moduleInfo.classId !== classId) {
            throw new Error("Action non autorisée. Ce cours n'appartient pas à votre classe.");
        }
        const moduleName = moduleInfo.name;

        // 2. Préparation des données pour l'enregistrement
        const presencesSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAMES.SCAN);
        const presencesData = presencesSheet.getDataRange().getValues();
        const presencesHeaders = presencesData[0];
        const pr_studentIdIdx = presencesHeaders.indexOf('ID_ETUDIANT');
        const pr_moduleIdx = presencesHeaders.indexOf('MODULE');
        const pr_dateScanIdx = presencesHeaders.indexOf('DATE_SCAN');

        const studentMap = getStudentMap();
        const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

        // Créer un Set des présences existantes pour ce cours aujourd'hui pour une vérification rapide
        const existingPresences = new Set(
            presencesData.slice(1)
            .filter(row => row[pr_moduleIdx] === moduleName && row[pr_dateScanIdx] === todayStr)
            .map(row => row[pr_studentIdIdx])
        );

        const rowsToAdd = [];
        const timestamp = new Date();
        const timeStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'HH:mm:ss');

        studentIds.forEach(studentId => {
            if (!existingPresences.has(studentId)) {
                const studentInfo = studentMap[studentId];
                if (studentInfo && studentInfo.classId === classId) { // Double sécurité
                    rowsToAdd.push([timestamp, studentId, studentInfo.name, className, moduleName, todayStr, timeStr, 'Présent']);
                }
            }
        });

        // 3. Enregistrement en masse
        if (rowsToAdd.length > 0) {
            presencesSheet.getRange(presencesSheet.getLastRow() + 1, 1, rowsToAdd.length, rowsToAdd[0].length).setValues(rowsToAdd);
        }

        return createJsonResponse({ success: true, message: `${rowsToAdd.length} étudiant(s) ont été marqués comme présents. ${studentIds.length - rowsToAdd.length} étaient déjà présents.` });

    } catch (error) {
        logError('responsableMarkOnlineAttendance', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
// ============================================================================
// NOUVEAU : FONCTIONS DU TABLEAU DE BORD
// ============================================================================

/**
 * Met en forme la feuille du tableau de bord.
 */
function setupDashboardSheet(sheet) {
  if (!sheet) return;
  sheet.clear();
  sheet.getRange('A1:F1').merge().setValue('Tableau de Bord - ABM EduPilote').setHorizontalAlignment('center').setFontSize(18).setFontWeight('bold').setBackground('#6a1b9a').setFontColor('white');
  
  // Fonctions pour appliquer les styles pour corriger l'erreur ".applyStyle is not a function"
  const applyHeaderStyle = (range) => range.setFontWeight('bold').setBackground('#f3e5f5').setFontSize(12);
  const applyMetricStyle = (range) => range.setFontWeight('bold').setFontSize(16).setFontColor('#4a148c');
  const applyLabelStyle = (range) => range.setFontColor('#6a1b9a').setFontSize(10);

  // Structure
  applyHeaderStyle(sheet.getRange('A3:B3').merge().setValue('STATISTIQUES GLOBALES'));
  applyLabelStyle(sheet.getRange('A4').setValue('Écoles'));
  applyLabelStyle(sheet.getRange('B4').setValue('Étudiants'));
  applyLabelStyle(sheet.getRange('A6').setValue('Filières'));
  applyLabelStyle(sheet.getRange('B6').setValue('Classes'));

  applyHeaderStyle(sheet.getRange('D3:F3').merge().setValue('ACTIVITÉ DU SYSTÈME'));
  applyLabelStyle(sheet.getRange('D4').setValue('Appels API (Total)'));
  applyLabelStyle(sheet.getRange('E4').setValue('Appels API (Aujourd\'hui)'));
  applyLabelStyle(sheet.getRange('D6').setValue('Erreurs (Total)'));
  applyLabelStyle(sheet.getRange('E6').setValue('Erreurs (Aujourd\'hui)'));
  applyLabelStyle(sheet.getRange('D8').setValue('Présences (Total)'));
  applyLabelStyle(sheet.getRange('E8').setValue('Présences (Aujourd\'hui)'));

  applyHeaderStyle(sheet.getRange('A10:F10').merge().setValue('DERNIÈRES ACTIONS'));
  sheet.getRange('A11').setValue('Timestamp');
  sheet.getRange('B11').setValue('Action');
  sheet.getRange('C11:F11').merge().setValue('Données');
  sheet.getRange('A11:F11').setFontWeight('bold').setBackground('#ede7f6');

  applyHeaderStyle(sheet.getRange('A17:F17').merge().setValue('DERNIÈRES ERREURS'));
  sheet.getRange('A18').setValue('Timestamp');
  sheet.getRange('B18:F18').merge().setValue('Message');
  sheet.getRange('A18:F18').setFontWeight('bold').setBackground('#fce4ec');

  sheet.getRange('F1').setValue('Dernière MàJ:').setFontSize(8).setHorizontalAlignment('right');

  // Appliquer les styles des métriques
  ['A5', 'B5', 'A7', 'B7', 'D5', 'E5', 'D7', 'E7', 'D9', 'E9'].forEach(cell => {
    applyMetricStyle(sheet.getRange(cell));
  });

  sheet.autoResizeColumns(1, 6);
}

/**
 * Met à jour les données du tableau de bord. Peut être appelée par un menu ou un déclencheur.
 */
function updateDashboardSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.DASHBOARD);
    if (!sheet) {
      SpreadsheetApp.getUi().alert("L'onglet 'Tableau de Bord' est introuvable. Veuillez exécuter le 'Setup' depuis le menu.");
      return;
    }

    const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

    // Fonctions pour compter les lignes (ignore l'en-tête)
    const countRows = (sheetName) => {
      const s = ss.getSheetByName(sheetName);
      return s ? Math.max(0, s.getLastRow() - 1) : 0;
    };

    // Fonctions pour compter les lignes d'aujourd'hui
    const countToday = (sheetName, dateColIndex) => {
      const s = ss.getSheetByName(sheetName);
      if (!s || s.getLastRow() < 2) return 0;
      const dates = s.getRange(2, dateColIndex, s.getLastRow() - 1, 1).getValues();
      return dates.filter(d => d[0] && Utilities.formatDate(new Date(d[0]), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd') === today).length;
    };

    // 1. Statistiques Globales
    sheet.getRange('A5').setValue(countRows(SHEET_NAMES.UNIVERSITIES));
    sheet.getRange('B5').setValue(countRows(SHEET_NAMES.STUDENTS));
    sheet.getRange('A7').setValue(countRows(SHEET_NAMES.FILIERES));
    sheet.getRange('B7').setValue(countRows(SHEET_NAMES.CLASSES));

    // 2. Activité du système
    sheet.getRange('D5').setValue(countRows(SHEET_NAMES.ACTION_LOG));
    sheet.getRange('E5').setValue(countToday(SHEET_NAMES.ACTION_LOG, 1));
    sheet.getRange('D7').setValue(countRows(SHEET_NAMES.ERROR_LOG));
    sheet.getRange('E7').setValue(countToday(SHEET_NAMES.ERROR_LOG, 1));
    sheet.getRange('D9').setValue(countRows(SHEET_NAMES.SCAN));
    sheet.getRange('E9').setValue(countToday(SHEET_NAMES.SCAN, 6)); // Colonne DATE_SCAN

    // 3. Dernières actions
    const actionSheet = ss.getSheetByName(SHEET_NAMES.ACTION_LOG);
    if (actionSheet && actionSheet.getLastRow() > 1) {
      const lastRow = actionSheet.getLastRow();
      const startRow = Math.max(2, lastRow - 4);
      const numRows = lastRow - startRow + 1;
      const lastActions = actionSheet.getRange(startRow, 1, numRows, 3).getValues().reverse();
      sheet.getRange('A12:F16').clearContent();
      sheet.getRange('A12:C16').setNumberFormat('@'); // Format texte pour éviter les conversions
      lastActions.forEach((action, i) => {
        sheet.getRange(12 + i, 1).setValue(new Date(action[0]).toLocaleString());
        sheet.getRange(12 + i, 2).setValue(action[1]);
        sheet.getRange(12 + i, 3).setValue(action[2]);
      });
    }

    // 4. Dernières erreurs
    const errorSheet = ss.getSheetByName(SHEET_NAMES.ERROR_LOG);
    if (errorSheet && errorSheet.getLastRow() > 1) {
      const lastRow = errorSheet.getLastRow();
      const startRow = Math.max(2, lastRow - 4);
      const numRows = lastRow - startRow + 1;
      const lastErrors = errorSheet.getRange(startRow, 1, numRows, 3).getValues().reverse();
      sheet.getRange('A19:F23').clearContent();
      lastErrors.forEach((error, i) => {
        sheet.getRange(19 + i, 1).setValue(new Date(error[0]).toLocaleString());
        sheet.getRange(19 + i, 2).merge().setValue(error[2]); // Message d'erreur
      });
    }

    sheet.getRange('F2').setValue(new Date().toLocaleTimeString());
    SpreadsheetApp.flush(); // Appliquer les changements
  } catch (e) {
    Logger.log(`Erreur lors de la mise à jour du tableau de bord: ${e.toString()}`);
    SpreadsheetApp.getUi().alert(`Erreur: ${e.message}`);
  }
}
/**
 * Met à jour les données du tableau de bord. Peut être appelée par un menu ou un déclencheur.
 */

/**
 * NOUVEAU: Récupère un profil étudiant complet pour l'administrateur.
 */
function getStudentProfileForAdmin(data) {
    try {
        const { studentId, universityId } = data;
        if (!studentId || !universityId) {
            throw new Error("Données manquantes pour récupérer le profil étudiant.");
        }

        // Le cache est spécifique à l'étudiant et à l'université pour la sécurité
        const cacheKey = `profile_admin_${studentId}_${universityId}`;
        
        const profile = getCachedData(cacheKey, () => {
            const ss = SpreadsheetApp.getActiveSpreadsheet(); // Garder pour le contexte

            // 1. Get student basic info
            const studentsSheet = ss.getSheetByName(SHEET_NAMES.STUDENTS);
            const studentsData = studentsSheet.getDataRange().getValues();
            const studentsHeaders = studentsData.shift();
            const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
            const studentRow = studentsData.find(row => row[studentIdIdx] === studentId);
            if (!studentRow) throw new Error("Étudiant non trouvé.");

            const student = {};
            studentsHeaders.forEach((header, i) => student[header] = studentRow[i]);
            
            // Security check
            if (universityId !== 'public' && student.ID_UNIVERSITE_FK !== universityId) {
                throw new Error("Accès non autorisé à cet étudiant.");
            }

            // 2. Get class and filiere names, attendance and schedule
            const classesSheet = ss.getSheetByName(SHEET_NAMES.CLASSES);
            const classesData = classesSheet.getDataRange().getValues();
            const classRow = classesData.find(row => row[0] === student.ID_CLASSE_FK);
            student.NOM_CLASSE = classRow ? classRow[1] : 'N/A';

            const filieresSheet = ss.getSheetByName(SHEET_NAMES.FILIERES);
            const filieresData = filieresSheet.getDataRange().getValues();
            const filiereRow = filieresData.find(row => row[0] === student.ID_FILIERE_FK);
            student.NOM_FILIERE = filiereRow ? filiereRow[1] : 'N/A';

            return { student };
        }, 600); // Cache de 10 minutes pour les infos de base

        return createJsonResponse({ success: true, data: profile });

    } catch (error) {
        logError('getStudentProfileForAdmin', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Récupère les modules et leurs statistiques pour un responsable.
 */
function responsableGetModules(data) {
    const { responsableId } = data;
    if (!responsableId) return createJsonResponse({ success: false, error: 'Session responsable invalide.' });

    const cacheKey = `modules_resp_${responsableId}`;
    try {
        const modulesWithStats = getCachedData(cacheKey, () => {
            const ctx = createRequestContext();
            const classInfo = getResponsableClassInfo(responsableId, ctx);

            // 1. Get all modules for the class
            const modulesData = _getRawSheetData(SHEET_NAMES.MODULES, ctx);
            const modulesHeaders = modulesData[0];
            const moduleClassFkIdx = modulesHeaders.indexOf('ID_CLASSE_FK');
            const classModules = modulesData.slice(1)
                .filter(row => row[moduleClassFkIdx] === classInfo.classId)
                .map(row => Object.fromEntries(modulesHeaders.map((h, i) => [h, row[i]])));

            // 2. Get all planned courses for the class
            const planningData = _getRawSheetData(SHEET_NAMES.PLANNING, ctx);
            const planningHeaders = planningData[0];
            const planningClassIdx = planningHeaders.indexOf('CLASSE');
            const planningModuleIdx = planningHeaders.indexOf('MODULE');
            const coursesByModule = planningData.slice(1)
                .filter(row => row[planningClassIdx] === classInfo.className)
                .reduce((acc, row) => {
                    const moduleName = row[planningModuleIdx];
                    if (moduleName) acc[moduleName] = (acc[moduleName] || 0) + 1;
                    return acc;
                }, {});

            // 3. Get all attendance records for the class
            const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
            const scanHeaders = scanData[0];
            const scanClassIdx = scanHeaders.indexOf('CLASSE');
            const scanModuleIdx = scanHeaders.indexOf('MODULE');
            const scanStudentIdIdx = scanHeaders.indexOf('ID_ETUDIANT');
            const attendanceByModule = scanData.slice(1)
                .filter(row => row[scanClassIdx] === classInfo.className)
                .reduce((acc, row) => {
                    const moduleName = row[scanModuleIdx];
                    const studentId = row[scanStudentIdIdx];
                    if (moduleName && studentId) {
                        if (!acc[moduleName]) acc[moduleName] = new Set();
                        acc[moduleName].add(studentId);
                    }
                    return acc;
                }, {});

            // 4. Combine stats
            return classModules.map(mod => ({
                ...mod,
                plannedCourses: coursesByModule[mod.NOM_MODULE] || 0,
                uniqueAttendees: (attendanceByModule[mod.NOM_MODULE] && attendanceByModule[mod.NOM_MODULE].size) || 0
            })).sort((a, b) => a.NOM_MODULE.localeCompare(b.NOM_MODULE));

        }, 180); // Cache de 3 minutes

        return createJsonResponse({ success: true, data: modulesWithStats });
    } catch (error) {
        logError('responsableGetModules', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Met à jour le statut d'un module.
 */
function responsableUpdateModuleStatus(data) {
    try {
        const { responsableId, moduleId, newStatus } = data;
        // ... (logique de mise à jour du statut dans la feuille Modules)
        // ... (vérification de sécurité que le module appartient bien au responsable)
        // ... (invalidation du cache `modules_resp_${responsableId}`)
        return createJsonResponse({ success: true, message: "Statut du module mis à jour." });
    } catch (error) {
        logError('responsableUpdateModuleStatus', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}

/**
 * NOUVEAU: Exporte un résumé de tous les modules pour un responsable.
 * @param {object} data - Contient { responsableId }.
 */
function responsableExportModulesSummary(data) {
    try {
        const { responsableId } = data;
        if (!responsableId) {
            throw new Error("ID du responsable est requis.");
        }

        // 1. Récupérer les données des modules avec leurs statistiques
        const modulesResponse = responsableGetModules({ responsableId });
        const modulesResult = JSON.parse(modulesResponse.getContent());

        if (!modulesResult.success) {
            throw new Error(modulesResult.error || "Impossible de récupérer les données des modules.");
        }
        const modulesWithStats = modulesResult.data;

        if (modulesWithStats.length === 0) {
            throw new Error("Aucun module à exporter.");
        }

        // 2. Générer le contenu CSV
        const headers = ['NOM_MODULE', 'STATUT', 'SEANCES_PLANIFIEES', 'ETUDIANTS_PRESENTS_UNIQUES'];
        const rows = modulesWithStats.map(mod => [mod.NOM_MODULE, mod.STATUT, mod.plannedCourses, mod.uniqueAttendees]);
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${(cell != null ? cell.toString() : '').replace(/"/g, '""')}"`).join(','))].join('\n');

        // 3. Définir le nom du fichier
        const ctx = createRequestContext();
        const classInfo = getResponsableClassInfo(responsableId, ctx);
        const fileName = `Resume_Modules_${classInfo.className.replace(/\s/g, '_')}.csv`;

        return createJsonResponse({ success: true, data: { csvContent, fileName } });
    } catch (error) {
        logError('responsableExportModulesSummary', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Exporte la liste de présence pour un module donné pour un responsable.
 * @param {object} data - Contient { responsableId, module }.
 */
function responsableExportAttendanceByModule(data) {
    try {
        const { responsableId, module, universityId, classId: adminClassId } = data;
        if (!module || !universityId) {
            throw new Error("Module et ID Université sont requis.");
        }

        const ctx = createRequestContext();
        let classId, className;

        // CORRECTION: Logique pour gérer l'appel depuis l'admin ou le responsable
        if (responsableId === 'admin_export_request') {
            // Appel vient de l'admin
            if (!adminClassId) throw new Error("ID de la classe manquant pour l'export admin.");
            classId = adminClassId;
            const classMap = new Map(_getRawSheetData(SHEET_NAMES.CLASSES, ctx).slice(1).map(row => [row[0], row[1]]));
            className = classMap.get(classId);
            if (!className) throw new Error("Classe non trouvée pour l'export.");
        } else {
            // Appel vient d'un responsable
            const classInfo = getResponsableClassInfo(responsableId, ctx);
            ({ classId, className } = classInfo);
        }

        // 1. Get all students in the class
        const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
        const studentsHeaders = studentsData[0];
        const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
        const studentNameIdx = studentsHeaders.indexOf('NOM_COMPLET');
        const studentClassFkIdx = studentsHeaders.indexOf('ID_CLASSE_FK');
        const studentsInClass = studentsData.slice(1)
            .filter(row => row[studentClassFkIdx] === classId)
            .map(row => ({ id: row[studentIdIdx], name: row[studentNameIdx] }));

        // 2. Get all attendance records for that class and subject
        const scanData = _getRawSheetData(SHEET_NAMES.SCAN, ctx);
        const scanHeaders = scanData[0];
        const scanStudentIdIdx = scanHeaders.indexOf('ID_ETUDIANT');
        const scanClassIdx = scanHeaders.indexOf('CLASSE');
        const scanModuleIdx = scanHeaders.indexOf('MODULE');
        const attendanceCounts = scanData.slice(1)
            .filter(row => row[scanClassIdx] === className && row[scanModuleIdx] === module)
            .reduce((acc, row) => {
                const studentId = row[scanStudentIdIdx];
                if (studentId) acc[studentId] = (acc[studentId] || 0) + 1;
                return acc;
            }, {});

        // 3. Combine data and generate CSV
        const headers = ['ID_ETUDIANT', 'NOM_COMPLET', 'NOMBRE_PRESENCES'];
        const rows = studentsInClass.map(student => [student.id, student.name, attendanceCounts[student.id] || 0]);
        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
        const fileName = `Presence_${className.replace(/\s/g, '_')}_${module.replace(/\s/g, '_')}.csv`;

        return createJsonResponse({ success: true, data: { csvContent, fileName } });
    } catch (error) {
        logError('responsableExportAttendanceByModule', error);
        return createJsonResponse({ success: false, error: error.message });
    }
}
/**
 * NOUVEAU: Récupère un profil étudiant public (sans authentification).
 */
function getPublicStudentProfile(data) {
    try {
        const { studentId } = data;
        if (!studentId) {
            throw new Error("ID Étudiant manquant.");
        }

        const cacheKey = `profile_public_${studentId}`;
        const profile = getCachedData(cacheKey, () => {            
            const ctx = createRequestContext(); // Créer un contexte pour cette opération
            const studentsData = _getRawSheetData(SHEET_NAMES.STUDENTS, ctx);
            const studentsHeaders = studentsData.shift();
            const studentIdIdx = studentsHeaders.indexOf('ID_ETUDIANT');
            const studentRow = studentsData.find(row => row[studentIdIdx] === studentId);
            if (!studentRow) throw new Error("Étudiant non trouvé.");

            const student = {};
            studentsHeaders.forEach((header, i) => student[header] = studentRow[i]);
            
            const classRow = _getRawSheetData(SHEET_NAMES.CLASSES, ctx).slice(1).find(row => row[0] === student.ID_CLASSE_FK);
            const filiereRow = _getRawSheetData(SHEET_NAMES.FILIERES, ctx).slice(1).find(row => row[0] === student.ID_FILIERE_FK);
            
            const universitiesData = _getRawSheetData(SHEET_NAMES.UNIVERSITIES, ctx);
            const univHeaders = universitiesData[0];
            const univIdIdx = univHeaders.indexOf('ID_UNIVERSITE');
            const univNameIdx = univHeaders.indexOf('NOM_UNIVERSITE');
            const universityRow = universitiesData.slice(1).find(row => row[univIdIdx] === student.ID_UNIVERSITE_FK);
            student.NOM_UNIVERSITE = universityRow ? universityRow[univNameIdx] : 'N/A';

            student.NOM_CLASSE = classRow ? classRow[1] : 'N/A';
            student.NOM_FILIERE = filiereRow ? filiereRow[1] : 'N/A';
            return { student };
        }, 600);

        return createJsonResponse({ success: true, data: profile });
    } catch (error) {
        return createJsonResponse({ success: false, error: error.message });
    }
}

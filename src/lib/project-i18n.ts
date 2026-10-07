// French wording for the built-in project templates (field labels, answers,
// phases and tasks). The data stays in English in the database; these helpers
// translate it for display (project page, proposal PDF) when the reader is
// French. Anything not listed (e.g. text you typed yourself) is left as is.

// Whole-string translations: field labels, option values, phase names, task titles.
const EXACT: Record<string, string> = {
  // ---- answers
  "Create the logo (main, horizontal, icon-only, light and dark versions)": "Créer le logo (principal, horizontal, icône seule, versions pâle et foncée)",
  "Choose the colour palette (primary, secondary, accent, neutrals)": "Choisir la palette de couleurs (primaire, secondaire, accent, neutres)",
  "Choose the fonts (headings, body, accents)": "Choisir les polices (titres, texte, accents)",
  "Create the icon set": "Créer le jeu d'icônes",
  "Design the interface components (buttons, forms, cards, navigation)": "Concevoir les composants d'interface (boutons, formulaires, cartes, navigation)",
  "Create the graphics and patterns": "Créer les éléments graphiques et les motifs",
  "Define the photo style and collect the photos": "Définir le style photo et recueillir les photos",
  "Define the chart and data-visualization style": "Définir le style des diagrammes et de la visualisation de données",
  "Define the brand voice and tone": "Définir la voix et le ton de la marque",
  "Create the brand guide (PDF)": "Créer le guide de marque (PDF)",
  Training: "Formation", "Train the client to manage their accounts": "Former le client à gérer ses comptes", "Hand over the account access (credentials)": "Remettre les accès aux comptes (identifiants)",
  "Send the training materials and recordings": "Envoyer le matériel et les enregistrements de formation", "Confirm the client is comfortable managing it": "Confirmer que le client est à l'aise de gérer ses comptes",
  "2nd Instalment": "2e versement", "Send the 2nd instalment invoice": "Envoyer la facture du 2e versement", "Await the 2nd instalment payment": "Attendre le paiement du 2e versement",
  Brand: "Image de marque", "Mock-up approval by": "Maquette approuvée par",
  "Create a brand for the client": "Créer l'image de marque du client", "Build mock-up": "Créer la maquette", "Present mock-up": "Présenter la maquette",
  "Collect the client's existing brand assets": "Recueillir les éléments de marque existants du client", "Define the brand voice and style": "Définir la voix et le style de la marque",
  "Create the logo": "Créer le logo", "Choose the colours and fonts": "Choisir les couleurs et les polices", "Create the brand guide": "Créer le guide de marque",
  "Add the brand to the client's Brand card": "Ajouter la marque à la carte Marque du client",
  "Review the brand guides": "Réviser les guides de marque",
  "Review the research reports": "Réviser les rapports de recherche",
  Yes: "Oui",
  No: "Non",
  // languages
  English: "Anglais", French: "Français", Spanish: "Espagnol", German: "Allemand", Italian: "Italien",
  Portuguese: "Portugais", Dutch: "Néerlandais", Arabic: "Arabe", Mandarin: "Mandarin",
  // pages & forms
  "Home Page": "Page d'accueil", "Services Page": "Page Services", "Product Page": "Page Produit",
  "About Page": "Page À propos", "Contact Page": "Page Contact", "Team Page": "Page Équipe",
  "Opt-In Forms": "Formulaires d'inscription", "Meeting Form": "Formulaire de rendez-vous", "Contact Form": "Formulaire de contact",
  // funnels
  "Lead Funnel": "Tunnel de capture de prospects", "Call/Meeting Funnel": "Tunnel d'appel/rencontre", "Sales Funnel": "Tunnel de vente",
  "Webinar Funnel": "Tunnel de webinaire", "Bridge Funnel": "Tunnel passerelle",
  // social
  "Facebook Profile": "Profil Facebook", "Facebook Pages": "Pages Facebook", "Instagram Profiles": "Profils Instagram",
  "LinkedIn Profile": "Profil LinkedIn", "LinkedIn Pages": "Pages LinkedIn", "TikTok Profiles": "Profils TikTok",
  "X Profiles": "Profils X", "YouTube Account": "Compte YouTube", "YouTube Channels": "Chaînes YouTube",
  // misc options
  Weekly: "Hebdomadaire", "Bi-weekly": "Aux deux semaines", Monthly: "Mensuelle",
  "Client provides it": "Le client le fournit", "We create it": "Nous le créons", "AI-assisted": "Assisté par l'IA",
  "User login": "Connexion utilisateur", Payments: "Paiements", Notifications: "Notifications",
  "Admin dashboard": "Tableau de bord administrateur", "API integration": "Intégration d'API", Analytics: "Analytique",
  "Funnel strategy": "Stratégie de tunnels", "AI tools deployment": "Déploiement d'outils d'IA", "Traffic generation": "Génération de trafic",
  "Client acquisition": "Acquisition de clients", "Affiliate marketing": "Marketing d'affiliation",
  "Video call": "Appel vidéo", Phone: "Téléphone", "In person": "En personne",
  Email: "Courriel", Calendar: "Calendrier", SMS: "SMS", Forms: "Formulaires", Accounting: "Comptabilité",
  Simple: "Simple", Standard: "Standard", Advanced: "Avancé",
  Welcome: "Bienvenue", Nurture: "Maturation", "Abandoned cart": "Panier abandonné", Promotional: "Promotionnel", "Re-engagement": "Réengagement",
  Promotions: "Promotions", "Appointment reminders": "Rappels de rendez-vous", "Follow-up": "Suivi",
  "One-on-one": "Individuel", Group: "Groupe", Workshop: "Atelier",
  Web: "Web",

  // ---- field labels
  "Domain setup": "Configuration du domaine", Registrar: "Registraire", "DNS Provider": "Fournisseur DNS", "App setup": "Configuration de l'application",
  "App to use": "Application à utiliser", "Research competition": "Recherche de la concurrence", Model: "Maquette", "Model approval": "Approbation de la maquette",
  "Model approval by": "Maquette approuvée par", Languages: "Langues", Pages: "Pages", Blog: "Blogue", Newsletters: "Infolettres", "Opt-in forms": "Formulaires d'inscription",
  "Domain / sub-domain setup": "Configuration du domaine / sous-domaine", Funnels: "Tunnels", "Lead magnet description": "Description de l'aimant à prospects",
  "Lead magnet file (link)": "Fichier de l'aimant à prospects (lien)", "Social media platforms": "Plateformes de médias sociaux", "What to set up": "À configurer",
  "Post automation": "Automatisation des publications", "Blog platform": "Plateforme de blogue", "Topics / categories": "Sujets / catégories",
  "Number of articles to write": "Nombre d'articles à rédiger", "Keyword & competition research": "Recherche de mots-clés et de concurrence",
  "SEO optimization": "Optimisation SEO", "Newsletter opt-in form on the blog": "Formulaire d'inscription à l'infolettre sur le blogue",
  "Email platform": "Plateforme de courriel", Frequency: "Fréquence", "Import an existing list": "Importer une liste existante", "Welcome email sequence": "Séquence de courriels de bienvenue",
  Platforms: "Plateformes", "Automation tool": "Outil d'automatisation", "Automation tools": "Outils d'automatisation", "Posts per week": "Publications par semaine", "Who creates the content": "Qui crée le contenu",
  "Design mock-ups": "Concevoir des maquettes", "Mock-up approval": "Approbation des maquettes", "Approval by": "Approuvé par", Features: "Fonctionnalités",
  "App type": "Type d'application", "Minimum OS versions": "Versions minimales des systèmes", "App framework / language": "Cadre / langage de l'application",
  "UI kit / design system": "Trousse d'interface / système de design", "Number of screens": "Nombre d'écrans", "Back end": "Serveur (back end)", "API style": "Style d'API",
  Database: "Base de données", "Database provider": "Fournisseur de base de données", "ORM / data layer": "ORM / couche de données", "Works offline / sync": "Fonctionne hors ligne / synchronisation",
  "Hosting / cloud": "Hébergement / infonuagique", Environments: "Environnements", "File / media storage": "Stockage de fichiers / médias", "Sign-in methods": "Méthodes de connexion",
  "Authentication service": "Service d'authentification", "Notifications & messaging": "Notifications et messagerie", "Third-party APIs": "API tierces",
  "Analytics & monitoring": "Analytique et surveillance", "Code repository": "Dépôt de code", "CI/CD & builds": "CI/CD et compilations",
  "Privacy & compliance": "Confidentialité et conformité", "Store developer accounts": "Comptes développeur des boutiques", Distribution: "Distribution", "Support after launch": "Soutien après le lancement",
  "Consulting topics": "Sujets de consultation", Format: "Format", "Discovery call": "Appel de découverte", "Written report": "Rapport écrit",
  "Store platform": "Plateforme de boutique", "Number of products": "Nombre de produits", "Payment gateways": "Passerelles de paiement",
  "Shipping setup": "Configuration de la livraison", "Tax setup": "Configuration des taxes", CRM: "CRM", "Import existing contacts": "Importer les contacts existants",
  "Custom fields": "Champs personnalisés", "Pipelines / stages": "Pipelines / étapes", Automations: "Automatisations", Integrations: "Intégrations",
  Complexity: "Complexité", "Apps to connect": "Applications à connecter", "Workflows to build": "Flux de travail à créer", Documentation: "Documentation",
  "Sender domain authentication": "Authentification du domaine d'envoi", "Email sequences": "Séquences de courriels", "SMS provider": "Fournisseur SMS",
  "Set up a sending number": "Configurer un numéro d'envoi", "Opt-in / consent collection": "Collecte des consentements", Campaigns: "Campagnes",
  Topics: "Sujets", "Number of sessions": "Nombre de séances", "Training materials needed": "Matériel de formation requis", "Record sessions": "Enregistrer les séances",
  "Affiliate programs": "Programmes d'affiliation", "Promotion platforms": "Plateformes de promotion", "Lead magnet": "Aimant à prospects",
  "Bridge / review page": "Page passerelle / d'évaluation", "Email follow-up sequence": "Séquence de courriels de suivi", "Tracking links": "Liens de suivi",

  // ---- phases
  Proposal: "Soumission", Research: "Recherche", "Mock-up": "Maquette", "Domain Setup": "Configuration du domaine", "App Setup": "Configuration de l'application",
  "Building Pages": "Création des pages", Testing: "Tests", Presenting: "Présentation", Deploying: "Déploiement", "Final Payment": "Paiement final",
  "Lead Magnet": "Aimant à prospects", "Building Funnels": "Création des tunnels", "Account Setup": "Configuration des comptes",
  "Profile Optimization": "Optimisation des profils", Review: "Révision", "Blog Setup": "Configuration du blogue", Writing: "Rédaction", SEO: "SEO", Publishing: "Publication",
  Setup: "Configuration", Template: "Modèle", "Welcome Sequence": "Séquence de bienvenue", Content: "Contenu", "Testing & Launch": "Tests et lancement",
  "Tool Setup": "Configuration de l'outil", "Content Calendar": "Calendrier de contenu", Automation: "Automatisation", Development: "Développement", Release: "Mise en production",
  Discovery: "Découverte", Strategy: "Stratégie", Sessions: "Séances", Report: "Rapport", "Catalog Planning": "Planification du catalogue", Delivery: "Livraison", "Wrap-up": "Conclusion",
  "Store Setup": "Configuration de la boutique", Products: "Produits", Launch: "Lancement", Data: "Données", Customization: "Personnalisation",
  "Training & Handover": "Formation et remise", Scoping: "Cadrage", Connections: "Connexions", Build: "Développement", Handover: "Remise",
  Compliance: "Conformité", "Email Design": "Conception des courriels", Sequences: "Séquences", Preparation: "Préparation", Tracking: "Suivi des liens", Promotion: "Promotion",
  "Funnel & Content": "Tunnel et contenu",

  // ---- tasks without placeholders
  "Prepare the proposal": "Préparer la soumission", "Present (send) the proposal": "Présenter (envoyer) la soumission",
  "Await the answer to the proposal": "Attendre la réponse à la soumission", "Receive the 1st instalment": "Recevoir le 1er versement", "Receive the signed proposal and 1st instalment": "Recevoir la soumission signée et le 1er versement",
  "Find competitors": "Trouver les concurrents", "Take screenshots": "Prendre des captures d'écran", "Produce report": "Produire le rapport",
  "Build model": "Créer la maquette", "Present model": "Présenter la maquette", "Buy domain": "Acheter le domaine", "Migrate domain": "Migrer le domaine",
  "Present the work to the client": "Présenter le travail au client", "Collect feedback and approval": "Recueillir les commentaires et l'approbation",
  "Make the final adjustments": "Faire les ajustements finaux", "Deploy / go live": "Déployer / mise en ligne",
  "Send the final invoice": "Envoyer la facture finale", "Receive the final instalment": "Recevoir le dernier versement",
  "Buy domain / sub-domain": "Acheter le domaine / sous-domaine", "Create lead magnet": "Créer l'aimant à prospects",
  "Upload lead magnet file": "Téléverser le fichier de l'aimant à prospects", "Connect lead magnet delivery": "Connecter la livraison de l'aimant à prospects",
  "Review all accounts with the client": "Réviser tous les comptes avec le client", "Research keywords": "Rechercher les mots-clés",
  "Review competitor blogs": "Examiner les blogues concurrents", "Produce content plan": "Produire le plan de contenu",
  "Configure design and menus": "Configurer le design et les menus", "Add newsletter opt-in form": "Ajouter le formulaire d'inscription à l'infolettre",
  "Optimize titles and meta descriptions": "Optimiser les titres et les méta-descriptions", "Add internal links and images": "Ajouter les liens internes et les images",
  "Review articles with the client": "Réviser les articles avec le client", "Publish articles": "Publier les articles", "Test blog on mobile": "Tester le blogue sur mobile",
  "Authenticate sender domain": "Authentifier le domaine d'envoi", "Import and clean the existing list": "Importer et nettoyer la liste existante",
  "Create sign-up form": "Créer le formulaire d'inscription", "Design newsletter template": "Concevoir le modèle d'infolettre", "Get template approval": "Obtenir l'approbation du modèle",
  "Build welcome automation": "Créer l'automatisation de bienvenue", "Send test emails": "Envoyer des courriels de test",
  "Check deliverability and spam score": "Vérifier la délivrabilité et le pointage de spam", "Send first newsletter": "Envoyer la première infolettre",
  "Create content calendar": "Créer le calendrier de contenu", "Build posting schedule": "Créer l'horaire de publication",
  "Build automation workflow": "Créer le flux d'automatisation", "Review first week of posts with the client": "Réviser la première semaine de publications avec le client",
  "Find competing apps": "Trouver les applications concurrentes", "Present mock-ups": "Présenter les maquettes",
  "Set up project and environments": "Configurer le projet et les environnements", "Fix bugs": "Corriger les bogues", "Hand over to the client": "Remettre au client",
  "Run discovery call": "Tenir l'appel de découverte", "Document needs and goals": "Documenter les besoins et les objectifs", "Write summary report": "Rédiger le rapport sommaire",
  "Present report": "Présenter le rapport", "Follow-up call": "Appel de suivi", "Collect feedback": "Recueillir les commentaires",
  "Define goals and scope": "Définir les objectifs et la portée", "Break the work into tasks": "Découper le travail en tâches", "Do the work": "Réaliser le travail",
  "Deliver to the client": "Livrer au client", "Send final invoice": "Envoyer la facture finale", "Define product catalog and categories": "Définir le catalogue et les catégories de produits",
  "Collect product photos and descriptions": "Recueillir les photos et descriptions des produits", "Configure shipping": "Configurer la livraison", "Configure taxes": "Configurer les taxes",
  "Design store theme and pages": "Concevoir le thème et les pages de la boutique", "Place a test order": "Passer une commande test", "Test on mobile": "Tester sur mobile",
  "Go live": "Mettre en ligne", "Map the client's current process": "Cartographier le processus actuel du client", "Clean the contact list": "Nettoyer la liste de contacts",
  "Check imported data": "Vérifier les données importées", "Create custom fields": "Créer les champs personnalisés", "Build pipelines and stages": "Créer les pipelines et les étapes",
  "Set up tags and views": "Configurer les étiquettes et les vues", "Build CRM automations": "Créer les automatisations du CRM", "Test automations": "Tester les automatisations",
  "Train the client's team": "Former l'équipe du client", "Document the setup": "Documenter la configuration", "Map each workflow step by step": "Cartographier chaque flux étape par étape",
  "Confirm triggers, actions and error handling": "Confirmer les déclencheurs, les actions et la gestion des erreurs", "Test with real data": "Tester avec des données réelles",
  "Test error cases": "Tester les cas d'erreur", "Write workflow documentation": "Rédiger la documentation des flux", "Walk the client through the automations": "Présenter les automatisations au client",
  "Turn automations on": "Activer les automatisations", "Authenticate sender domain (SPF, DKIM, DMARC)": "Authentifier le domaine d'envoi (SPF, DKIM, DMARC)",
  "Import and clean the list": "Importer et nettoyer la liste", "Create sign-up forms": "Créer les formulaires d'inscription", "Design email template": "Concevoir le modèle de courriel",
  "Build sequence automations and tags": "Créer les automatisations et les étiquettes des séquences", "Check deliverability": "Vérifier la délivrabilité",
  "Provision a sending number": "Obtenir un numéro d'envoi", "Build opt-in form with consent wording (CASL / TCPA)": "Créer le formulaire d'inscription avec le libellé de consentement (LCAP / TCPA)",
  "Add STOP / unsubscribe handling": "Ajouter la gestion des désabonnements (STOP)", "Send test messages": "Envoyer des messages de test",
  "Check delivery and replies": "Vérifier la livraison et les réponses", "Define learning goals": "Définir les objectifs d'apprentissage",
  "Prepare training materials": "Préparer le matériel de formation", "Send session recordings": "Envoyer les enregistrements des séances",
  "Send summary and next steps": "Envoyer le résumé et les prochaines étapes", "Compare programs and commissions": "Comparer les programmes et les commissions",
  "Review clicks and conversions": "Examiner les clics et les conversions",
};

// Titles built from the answers: "{key}" stands for what was picked.
const PATTERNS: [string, string][] = [
  ["Get model approval ({modelApprovalBy})", "Obtenir l'approbation de la maquette ({modelApprovalBy})"],
  ["Get mock-up approval ({modelApprovalBy})", "Obtenir l'approbation de la maquette ({modelApprovalBy})"],
  ["Setup domain (DNS: {dnsProvider})", "Configurer le domaine (DNS : {dnsProvider})"],
  ["Create {app} account", "Créer le compte {app}"],
  ["Setup app ({app})", "Configurer l'application ({app})"],
  ["Build {languages} {pages}", "Créer {pages} ({languages})"],
  ["Build {languages} {forms}", "Créer {forms} ({languages})"],
  ["Test {languages} {pages}", "Tester {pages} ({languages})"],
  ["Test {languages} {forms}", "Tester {forms} ({languages})"],
  ["Build {funnels} ({languages})", "Créer {funnels} ({languages})"],
  ["Test {funnels} ({languages})", "Tester {funnels} ({languages})"],
  ["Set up {setup}", "Configurer {setup}"],
  ["Optimize {platforms} profile ({languages})", "Optimiser le profil {platforms} ({languages})"],
  ["Create the blog ({app})", "Créer le blogue ({app})"],
  ["Create categories: {topics}", "Créer les catégories : {topics}"],
  ["Write {languages} article – {topics}", "Rédiger l'article ({languages}) – {topics}"],
  ["Create {esp} account", "Créer le compte {esp}"],
  ["Write {languages} welcome email", "Rédiger le courriel de bienvenue ({languages})"],
  ["Write first {languages} newsletter ({frequency})", "Rédiger la première infolettre ({languages}, {frequency})"],
  ["Create {tool} account", "Créer le compte {tool}"],
  ["Connect {platforms} account", "Connecter le compte {platforms}"],
  ["Choose the architecture and write the technical specification", "Choisir l'architecture et rédiger la spécification technique"],
  ["Set up the code repository ({repo})", "Configurer le dépôt de code ({repo})"],
  ["Set up the {environments} environment", "Configurer l'environnement {environments}"],
  ["Provision the database ({databaseProvider})", "Mettre en place la base de données ({databaseProvider})"],
  ["Set up hosting ({hosting})", "Configurer l'hébergement ({hosting})"],
  ["Set up file storage ({storage})", "Configurer le stockage de fichiers ({storage})"],
  ["Set up the CI/CD pipeline ({cicd})", "Configurer le pipeline CI/CD ({cicd})"],
  ["Create the developer accounts for the stores", "Créer les comptes développeur des boutiques"],
  ["Set up authentication ({authProvider}: {authMethods})", "Configurer l'authentification ({authProvider} : {authMethods})"],
  ["Connect payments ({payments})", "Connecter les paiements ({payments})"],
  ["Set up notifications ({notifications})", "Configurer les notifications ({notifications})"],
  ["Integrate {thirdParty}", "Intégrer {thirdParty}"],
  ["Add offline mode and data sync", "Ajouter le mode hors ligne et la synchronisation"],
  ["Add analytics and monitoring ({analytics})", "Ajouter l'analytique et la surveillance ({analytics})"],
  ["Run the planned tests ({testing})", "Exécuter les tests prévus ({testing})"],
  ["Privacy and security review ({compliance})", "Revue de confidentialité et de sécurité ({compliance})"],
  ["Prepare the store listings (screenshots, description, privacy policy)", "Préparer les fiches des boutiques (captures d'écran, description, politique de confidentialité)"],
  ["Hand over the code, accounts and documentation to the client", "Remettre le code, les comptes et la documentation au client"],
  ["Set up support after launch ({support})", "Mettre en place le soutien après le lancement ({support})"],
  ["Plan posts per week: {postsPerWeek}", "Planifier les publications par semaine : {postsPerWeek}"],
  ["Plan {postsPerWeek} posts per week", "Planifier {postsPerWeek} publications par semaine"],
  ["Prepare {languages} content for {platforms}", "Préparer le contenu ({languages}) pour {platforms}"],
  ["Test scheduled post – {platforms}", "Tester la publication planifiée – {platforms}"],
  ["Get mock-up approval ({approvalBy})", "Obtenir l'approbation des maquettes ({approvalBy})"],
  ["Build {features}", "Créer {features}"],
  ["Translate app to {languages}", "Traduire l'application ({languages})"],
  ["Test on {platforms}", "Tester sur {platforms}"],
  ["Publish to {platforms}", "Publier sur {platforms}"],
  ["Schedule discovery call ({format})", "Planifier l'appel de découverte ({format})"],
  ["Prepare strategy – {topics}", "Préparer la stratégie – {topics}"],
  ["Hold consulting session – {topics}", "Tenir la séance de consultation – {topics}"],
  ["Create {app} store", "Créer la boutique {app}"],
  ["Connect {payments}", "Connecter {payments}"],
  ["Add {products} products ({languages})", "Ajouter {products} produits ({languages})"],
  ["Test checkout and payment ({payments})", "Tester le paiement ({payments})"],
  ["List what needs customizing in {crm}", "Lister ce qui doit être personnalisé dans {crm}"],
  ["Import contacts into {crm}", "Importer les contacts dans {crm}"],
  ["Connect {integrations}", "Connecter {integrations}"],
  ["Connect {apps} to {tool}", "Connecter {apps} à {tool}"],
  ["Build workflow: {workflows}", "Créer le flux : {workflows}"],
  ["Write {languages} {sequences} sequence", "Rédiger la séquence {sequences} ({languages})"],
  ["Write {languages} {campaigns} messages", "Rédiger les messages {campaigns} ({languages})"],
  ["Create {provider} account", "Créer le compte {provider}"],
  ["Schedule {sessions} sessions ({format})", "Planifier {sessions} séances ({format})"],
  ["Deliver session: {topics}", "Donner la séance : {topics}"],
  ["Apply to {programs}", "S'inscrire à {programs}"],
  ["Build bridge page ({languages})", "Créer la page passerelle ({languages})"],
  ["Write follow-up email sequence ({languages})", "Rédiger la séquence de courriels de suivi ({languages})"],
  ["Create tracking links for {programs}", "Créer les liens de suivi pour {programs}"],
  ["Publish promotion on {platforms} ({languages})", "Publier la promotion sur {platforms} ({languages})"],
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");

// {languages} can only be a language we know, which keeps "Build {languages}
// {pages}" from swallowing "Build {features}" or "Build {funnels} ({languages})".
const LANG_ALT = ["English", "French", "Spanish", "German", "Italian", "Portuguese", "Dutch", "Arabic", "Mandarin"].join("|");

const COMPILED = PATTERNS.map(([en, fr]) => {
  let n = 0;
  const source = escapeRe(en).replace(/\\\{(\w+)\\\}/g, (_m, key: string) => {
    n += 1;
    return key === "languages" ? `(${LANG_ALT})` : "(.+?)";
  });
  const keys = [...en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  return { re: new RegExp(`^${source}$`), keys, fr, n };
});

// Known terms, longest first, for translating the values slotted into a title
// ("English, French" / "Home Page, Contact Page" / "Build English Home Page").
const TERMS = Object.keys(EXACT)
  .filter((k) => k.length > 1)
  .sort((a, b) => b.length - a.length);
const TERM_RE = new RegExp(`(?<![\\p{L}])(${TERMS.map(escapeRe).join("|")})(?![\\p{L}])`, "gu");

/** Translate a free-form value made of known terms ("English, French", "Yes"). */
export function frValue(text: string): string {
  if (!text) return text;
  if (EXACT[text]) return EXACT[text];
  return text.replace(TERM_RE, (m) => EXACT[m] ?? m);
}

import { getDict } from "@/lib/i18n/dictionaries";

// "Website — Building Pages": translate each side (the left one is a project type name).
const TYPE_EN_TO_FR: Record<string, string> = (() => {
  const en = getDict("en").projectTypes as Record<string, string>;
  const fr = getDict("fr").projectTypes as Record<string, string>;
  const out: Record<string, string> = {};
  for (const k of Object.keys(en)) if (fr[k]) out[en[k]] = fr[k];
  return out;
})();

/** Translate a field label, option, phase name or task title. */
export function frText(text: string): string {
  if (!text) return text;
  const sep = text.indexOf(" — ");
  if (sep > 0 && TYPE_EN_TO_FR[text.slice(0, sep)]) return `${TYPE_EN_TO_FR[text.slice(0, sep)]} — ${frText(text.slice(sep + 3))}`;
  const exact = EXACT[text];
  if (exact) return exact;
  for (const p of COMPILED) {
    const m = p.re.exec(text);
    if (m) {
      let out = p.fr;
      p.keys.forEach((key, i) => {
        out = out.split(`{${key}}`).join(frValue(m[i + 1]));
      });
      return out;
    }
  }
  return text;
}

/** Pick the right version for a reader language. */
export function localizeText(text: string, lang: "en" | "fr"): string {
  return lang === "fr" ? frText(text) : text;
}
export function localizeValue(text: string, lang: "en" | "fr"): string {
  return lang === "fr" ? frValue(text) : text;
}

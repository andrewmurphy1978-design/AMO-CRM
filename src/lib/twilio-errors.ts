// Plain-language explanations for the Twilio error codes people actually hit
// when texting, in English and French. Anything not listed falls back to
// Twilio's own wording plus the code, so a failure is never just a bare
// "Failed". Codes: https://www.twilio.com/docs/api/errors
type Lang = "en" | "fr";

const EXPLANATIONS: Record<string, { en: string; fr: string }> = {
  // Refused when sending (the API says no immediately)
  "21211": {
    en: "That doesn't look like a valid phone number. Check the number saved on the contact and include the country code.",
    fr: "Ce numéro de téléphone n'est pas valide. Vérifiez le numéro du contact et incluez l'indicatif du pays.",
  },
  "21408": {
    en: "Your Twilio account isn't allowed to send texts to that country. In Twilio, open Messaging > Settings > Geo permissions and switch that country on, then try again.",
    fr: "Votre compte Twilio n'est pas autorisé à envoyer des textos vers ce pays. Dans Twilio, ouvrez Messaging > Settings > Geo permissions, activez ce pays, puis réessayez.",
  },
  "21606": {
    en: "The Twilio number you send from can't send texts. Use a number that has SMS enabled.",
    fr: "Le numéro Twilio utilisé ne peut pas envoyer de textos. Utilisez un numéro dont les SMS sont activés.",
  },
  "21608": {
    en: "Your Twilio account is a trial account, which can only text phone numbers you have verified in Twilio. Verify this number in Twilio (Verified Caller IDs) or upgrade the account.",
    fr: "Votre compte Twilio est un compte d'essai, qui ne peut écrire qu'aux numéros vérifiés dans Twilio. Vérifiez ce numéro dans Twilio (Verified Caller IDs) ou faites passer le compte à un forfait payant.",
  },
  "21610": {
    en: "This person replied STOP to your number, so Twilio blocks further texts to them. They must text START to your number before you can message them again.",
    fr: "Cette personne a répondu STOP à votre numéro, donc Twilio bloque les textos vers elle. Elle doit envoyer START à votre numéro avant que vous puissiez lui écrire de nouveau.",
  },
  "21612": {
    en: "Twilio can't route a text to that number from your Twilio number. The destination may not be supported for your number type.",
    fr: "Twilio ne peut pas acheminer un texto vers ce numéro depuis votre numéro Twilio. La destination n'est peut-être pas prise en charge pour votre type de numéro.",
  },
  "21614": {
    en: "That number isn't a mobile number that can receive texts (it may be a landline).",
    fr: "Ce numéro n'est pas un numéro mobile pouvant recevoir des textos (il s'agit peut-être d'une ligne fixe).",
  },
  "21617": {
    en: "The message is too long. Shorten it and send it again.",
    fr: "Le message est trop long. Raccourcissez-le et renvoyez-le.",
  },
  // Accepted, then failed on the way (delivery status)
  "30001": {
    en: "Twilio's sending queue was full, so the message was dropped. Send it again in a moment.",
    fr: "La file d'envoi de Twilio était pleine et le message a été abandonné. Renvoyez-le dans un instant.",
  },
  "30002": {
    en: "Your Twilio account is suspended or out of funds. Check your Twilio balance and account status.",
    fr: "Votre compte Twilio est suspendu ou n'a plus de fonds. Vérifiez votre solde et l'état du compte dans Twilio.",
  },
  "30003": {
    en: "The person's phone couldn't be reached: it may be switched off, out of coverage, or unable to receive texts right now.",
    fr: "Le téléphone de la personne est injoignable : il est peut-être éteint, hors couverture ou incapable de recevoir des textos pour le moment.",
  },
  "30004": {
    en: "The message was blocked, either by the person (they opted out) or by their carrier.",
    fr: "Le message a été bloqué, soit par la personne (désabonnement), soit par son fournisseur de téléphonie.",
  },
  "30005": {
    en: "That phone number doesn't exist or is no longer in service.",
    fr: "Ce numéro de téléphone n'existe pas ou n'est plus en service.",
  },
  "30006": {
    en: "That number is a landline or one the carrier can't deliver texts to.",
    fr: "Ce numéro est une ligne fixe ou un numéro auquel le fournisseur ne peut pas livrer de textos.",
  },
  "30007": {
    en: "The carrier filtered the message as possible spam. Rewording it, or registering your number for business messaging, can help.",
    fr: "Le fournisseur a filtré le message comme un possible pourriel. Reformuler le message ou enregistrer votre numéro pour l'envoi commercial peut aider.",
  },
  "30008": {
    en: "The carrier failed to deliver the message for an unknown reason. Trying again later sometimes works.",
    fr: "Le fournisseur n'a pas pu livrer le message pour une raison inconnue. Réessayer plus tard fonctionne parfois.",
  },
  "30034": {
    en: "US carriers require this number to be registered (A2P 10DLC) before it can text US phones. A Canadian number texting Canada isn't affected.",
    fr: "Les fournisseurs américains exigent l'enregistrement de ce numéro (A2P 10DLC) avant d'écrire à des téléphones américains. Un numéro canadien qui écrit au Canada n'est pas concerné.",
  },
};

export function explainTwilioError(code: string | null | undefined, lang: Lang, fallback?: string | null): string | null {
  if (!code) return fallback ?? null;
  const known = EXPLANATIONS[code];
  const text = known?.[lang];
  if (text) return `${text} (${lang === "fr" ? "code Twilio" : "Twilio code"} ${code})`;
  return fallback ? `${fallback} (${lang === "fr" ? "code Twilio" : "Twilio code"} ${code})` : `${lang === "fr" ? "Erreur Twilio" : "Twilio error"} ${code}.`;
}

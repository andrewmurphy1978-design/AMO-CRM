// "After you accept": what happens once a proposal is accepted, fully or in part. One source for the proposal
// PDF and the proposal page, so they always say the same thing.

export type PaymentMethods = { interac: boolean; card: boolean };

const TEXT = {
  en: {
    title: "After you accept",
    methods: (m: PaymentMethods) =>
      m.interac && m.card ? "Interac e-Transfer or credit card" : m.interac ? "Interac e-Transfer" : m.card ? "credit card" : "the payment options available to you (Interac e-Transfer or credit card)",
    steps: (sectioned: boolean, methods: string, days: number) => [
      sectioned
        ? "Accept the whole project by signing the final acceptance at the end of this proposal, or only the parts you want by signing the acceptance block of each section. You can accept part of the project and decide on the rest later."
        : "Accept this proposal by signing the acceptance at the end of it and sending it back to us.",
      `As soon as we receive the signed proposal, you will receive an invoice for the 1st instalment${sectioned ? " of what you accepted" : ""}. It offers the ways to pay: ${methods}.`,
      `Work begins once the 1st instalment is received${sectioned ? ", on the sections you accepted" : ""}.`,
      "When the 2nd instalment and each following instalment falls due, a new invoice is issued for it, with the same payment options.",
      ...(sectioned ? [`Sections you have not accepted are not invoiced. You can accept them later, at the prices shown, while this proposal is valid (${days} days).`] : []),
    ],
  },
  fr: {
    title: "Une fois la soumission acceptée",
    methods: (m: PaymentMethods) =>
      m.interac && m.card ? "virement Interac ou carte de crédit" : m.interac ? "virement Interac" : m.card ? "carte de crédit" : "les modes de paiement offerts (virement Interac ou carte de crédit)",
    steps: (sectioned: boolean, methods: string, days: number) => [
      sectioned
        ? "Acceptez l'ensemble du projet en signant l'acceptation finale à la fin de cette soumission, ou seulement les parties de votre choix en signant le bloc d'acceptation de chaque section. Vous pouvez accepter une partie du projet et vous décider pour le reste plus tard."
        : "Acceptez cette soumission en signant l'acceptation à la fin du document et en nous la retournant.",
      `Dès que nous recevons la soumission signée, vous recevez une facture pour le 1er versement${sectioned ? " de ce que vous avez accepté" : ""}. Elle propose les modes de paiement : ${methods}.`,
      `Les travaux commencent à la réception du 1er versement${sectioned ? ", pour les sections acceptées" : ""}.`,
      "Lorsque le 2e versement, puis chacun des versements suivants, arrive à échéance, une nouvelle facture est émise, avec les mêmes modes de paiement.",
      ...(sectioned ? [`Les sections que vous n'avez pas acceptées ne sont pas facturées. Vous pourrez les accepter plus tard, aux prix indiqués, tant que cette soumission est valide (${days} jours).`] : []),
    ],
  },
};

export function afterAccept(lang: "en" | "fr", opts: { sectioned: boolean; payment?: PaymentMethods | null; validDays: number }): { title: string; steps: string[] } {
  const t = TEXT[lang];
  const methods = t.methods(opts.payment ?? { interac: false, card: false });
  return { title: t.title, steps: t.steps(opts.sectioned, methods, opts.validDays) };
}

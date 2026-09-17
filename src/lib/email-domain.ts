// A message addressed to Andrew's own domain gets answered from IONOS
// Webmail, not Gmail — highlighting these rows is a visual reminder of
// that before he clicks through to the wrong inbox.
//
// Deliberately its own file with zero dependencies: it's imported by
// email-card.tsx (a client component, for the Dashboard's email list) as
// well as the server-rendered Email page, and google.ts (where this used
// to live) imports @/lib/prisma — pulling that into a client bundle drags
// the Node-only `pg` driver in too, which doesn't resolve in the browser.
const OWN_DOMAIN = "@andrewmurphy.online";

export function isOwnDomainEmail(email: string): boolean {
  return email.toLowerCase().endsWith(OWN_DOMAIN);
}

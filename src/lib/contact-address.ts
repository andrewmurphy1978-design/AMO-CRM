export interface AddressFields {
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  billingAddress: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingZip: string | null;
  billingCountry: string | null;
}

// Street / "City Province Postal code" / country, one per line — the main address (the
// billing address is for invoices only, so pass `billing: true` to prefer it).
export function contactAddress(c: AddressFields, billing = false): string {
  const useBilling = billing && Boolean(c.billingAddress || c.billingCity);
  const [street, city, state, zip, country] = useBilling ? [c.billingAddress, c.billingCity, c.billingState, c.billingZip, c.billingCountry] : [c.address, c.city, c.state, c.zip, c.country];
  return [street, [city, state, zip].filter(Boolean).join(" "), country].filter(Boolean).join("\n");
}

export interface RecipientOption {
  id: string;
  name: string;
  company: string | null;
  relation: string | null; // "Client" or how the contact is linked to the client
  emails: string[];
  address: string;
}

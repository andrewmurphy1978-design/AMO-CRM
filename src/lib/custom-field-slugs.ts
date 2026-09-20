// Shared with the Contact detail page's "Other systeme.io fields" display
// and the Contact form's editable custom-field inputs, so both sides match
// the same raw fieldSlug up to the same known field regardless of its exact
// casing/punctuation (systeme.io's own slugs vary).
export function normalizeFieldSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Slug to write a brand-new value under when the contact has no existing
// ContactFieldValue row for this field yet (systeme.io typically snake_cases
// a custom field's label into its slug). An existing row's own slug is
// always preferred over this fallback so the same logical field is never
// forked under two different slugs.
export const SERVICES_REQUIRED_DEFAULT_SLUG = "services_required";
export const PROJECT_GOAL_DEFAULT_SLUG = "project_goal_description";

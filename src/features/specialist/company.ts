/**
 * Компания вместо имени (0245, №308): у account_type='company' в каталоге,
 * профиле и откликах показывается название, а не имя человека. Значок —
 * только при company_verified_at (проверено администратором).
 */

export interface CompanyFields {
  account_type?: string | null;
  legal_name?: string | null;
  company_verified_at?: string | null;
}

export function companyName(p: CompanyFields | null | undefined): string | null {
  const name = p?.account_type === "company" ? p.legal_name?.trim() : "";
  return name ? name : null;
}

export function displayName(
  first: string | null | undefined,
  last: string | null | undefined,
  profile: CompanyFields | null | undefined,
  fallback = "Специалист",
): string {
  return companyName(profile) ?? ([first, last].filter(Boolean).join(" ").trim() || fallback);
}

export function isCompanyVerified(p: CompanyFields | null | undefined): boolean {
  return p?.account_type === "company" && !!p.company_verified_at;
}

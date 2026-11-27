import { CONTACT_LINKS } from './contact';

/**
 * Operator details shown on the privacy policy, terms and data-deletion pages.
 * Fill the empty fields with the legal entity's real data before submitting an app to any platform:
 * reviewers compare these pages with the business documents.
 */
export const LEGAL = {
  /** Legal name exactly as on the business registration. */
  entityName: '',
  taxId: '',
  address: '',
  phone: '',
  email: CONTACT_LINKS.email,
  /** Public production domain, e.g. https://maokihouse.vn (no trailing slash). */
  siteUrl: '',
  /** Days within which a verified deletion request is completed. The owner must confirm this commitment. */
  deletionDays: 30,
  effectiveDate: '27/11/2026',
} as const;

export const entityLine = () => [LEGAL.entityName || 'MaokiHouse', LEGAL.taxId && `MST ${LEGAL.taxId}`, LEGAL.address].filter(Boolean).join(' · ');

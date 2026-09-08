/**
 * Kept as a re-export so existing adapter imports keep working. The parsing
 * itself moved to @classifieds/shared so the web app and the admin review
 * queue can apply the exact same lakh/crore rules.
 */
export {
  parseIndianPrice,
  extractPriceCandidates,
  reconcilePrice,
  assessPrice,
  LAKH,
  CRORE,
} from "@classifieds/shared";

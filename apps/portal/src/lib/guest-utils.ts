/**
 * Utility functions for guest (unauthenticated) user experience.
 * Handles callbackUrl construction for post-login redirect flows.
 */

/**
 * Builds the community sign-in URL with callbackUrl set to the current portal page.
 * @param communityUrl - The community base URL (e.g. "https://igbo.com")
 * @param currentUrl - The full current portal URL to return to after login
 * @param options.ref - Optional ref param appended to the currentUrl before encoding
 *                      (e.g. "apply" signals auto-open apply drawer post-login)
 * @returns Full sign-in URL with encoded callbackUrl
 */
export function buildSignInUrl(
  communityUrl: string,
  currentUrl: string,
  options?: { ref?: string },
): string {
  let targetUrl = currentUrl;
  if (options?.ref) {
    const url = new URL(currentUrl);
    url.searchParams.set("ref", options.ref);
    targetUrl = url.toString();
  }
  return `${communityUrl}/login?callbackUrl=${encodeURIComponent(targetUrl)}`;
}

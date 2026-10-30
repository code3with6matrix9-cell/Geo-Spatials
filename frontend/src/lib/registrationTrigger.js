/**
 * The registration modal is rendered by the legacy markup and wired up by
 * `public/legacy/registration.js` when it loads. Gallery navigation re-uses it
 * by clicking one of the legacy triggers that are already bound, which keeps
 * the existing registration flow (form, API call, success state) untouched.
 */
export function openRegistrationModal() {
  const trigger = document.querySelector("[data-open-register]");
  if (!trigger) {
    console.warn("[gallery] Registration trigger is not available yet.");
    return false;
  }
  trigger.click();
  return true;
}

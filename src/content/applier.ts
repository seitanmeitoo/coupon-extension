// Injection programmatique de codes dans le champ coupon.
// Deux impératifs :
//   1. Réveiller les frameworks des boutiques (React, Vue…) : on passe par le
//      setter NATIF de HTMLInputElement puis on émet des événements `bubbles`.
//   2. Rester distinguable d'une saisie MANUELLE : un drapeau est levé pendant
//      toute injection, et les événements synthétiques ont `isTrusted === false`.

let programmaticDepth = 0

/** `true` pendant qu'une injection programmatique est en cours. */
export function isProgrammaticInjection(): boolean {
  return programmaticDepth > 0
}

/** Écrit une valeur via le setter natif et notifie la page (input + change). */
export function setInputValueNative(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  if (descriptor?.set !== undefined) {
    descriptor.set.call(input, value)
  } else {
    input.value = value
  }
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

/**
 * Applique un code : remplit le champ puis déclenche le bouton « Appliquer »
 * (ou soumet le formulaire à défaut). Le drapeau programmatique couvre toute
 * la séquence synchrone d'événements.
 */
export function applyCode(
  input: HTMLInputElement,
  applyButton: HTMLElement | null,
  code: string,
): void {
  programmaticDepth++
  try {
    input.focus()
    setInputValueNative(input, code)
    if (applyButton !== null) {
      applyButton.click()
    } else if (input.form !== null) {
      input.form.requestSubmit()
    }
  } finally {
    programmaticDepth--
  }
}

/**
 * Vide le champ SANS rien soumettre. À utiliser pour nettoyer après une série
 * de codes infructueux : passer par `applyCode(input, null, '')` déclencherait
 * `input.form.requestSubmit()` sur les boutiques où le champ est dans un <form>,
 * soumettant un formulaire vide (voire rechargeant la page). Le drapeau
 * programmatique couvre l'événement émis pour ne pas le confondre avec une
 * saisie manuelle.
 */
export function clearInput(input: HTMLInputElement): void {
  programmaticDepth++
  try {
    setInputValueNative(input, '')
  } finally {
    programmaticDepth--
  }
}

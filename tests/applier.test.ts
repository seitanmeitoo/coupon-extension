// @vitest-environment jsdom
// Tests de l'injection : réveil de la page (événements) et surtout garde-fou
// contre la soumission accidentelle de formulaire lors du nettoyage du champ.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyCode, clearInput, isProgrammaticInjection, setInputValueNative } from '../src/content/applier'

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('setInputValueNative', () => {
  it('écrit la valeur et émet les événements input + change', () => {
    document.body.innerHTML = '<input type="text" id="c" />'
    const input = document.getElementById('c') as HTMLInputElement
    const events: string[] = []
    input.addEventListener('input', () => events.push('input'))
    input.addEventListener('change', () => events.push('change'))

    setInputValueNative(input, 'PROMO10')
    expect(input.value).toBe('PROMO10')
    expect(events).toEqual(['input', 'change'])
  })
})

describe('applyCode', () => {
  it('clique sur le bouton « Appliquer » quand il existe', () => {
    document.body.innerHTML = `
      <input type="text" id="c" />
      <button id="b">Appliquer</button>
    `
    const input = document.getElementById('c') as HTMLInputElement
    const button = document.getElementById('b') as HTMLButtonElement
    const clicked = vi.fn()
    button.addEventListener('click', clicked)

    applyCode(input, button, 'X1234')
    expect(input.value).toBe('X1234')
    expect(clicked).toHaveBeenCalledOnce()
  })

  it('le drapeau programmatique retombe à false après application', () => {
    document.body.innerHTML = '<input type="text" id="c" />'
    const input = document.getElementById('c') as HTMLInputElement
    applyCode(input, null, 'X1234')
    expect(isProgrammaticInjection()).toBe(false)
  })
})

describe('clearInput — ne doit JAMAIS soumettre le formulaire', () => {
  it('vide le champ sans déclencher la soumission d’un <form> englobant', () => {
    document.body.innerHTML = `
      <form id="f">
        <input type="text" id="c" name="coupon" value="ECHEC99" />
      </form>
    `
    const form = document.getElementById('f') as HTMLFormElement
    const input = document.getElementById('c') as HTMLInputElement
    const submitted = vi.fn((e: Event) => e.preventDefault())
    form.addEventListener('submit', submitted)

    clearInput(input)
    expect(input.value).toBe('')
    expect(submitted).not.toHaveBeenCalled()
  })

  it('émet tout de même un événement input pour notifier la page', () => {
    document.body.innerHTML = '<input type="text" id="c" value="X" />'
    const input = document.getElementById('c') as HTMLInputElement
    const onInput = vi.fn()
    input.addEventListener('input', onInput)
    clearInput(input)
    expect(onInput).toHaveBeenCalledOnce()
  })
})

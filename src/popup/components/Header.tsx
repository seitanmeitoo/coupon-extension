// En-tête du popup : identité de l'extension + domaine actif.

interface HeaderProps {
  domain: string | null
}

export default function Header({ domain }: HeaderProps) {
  return (
    <header className="bg-indigo-600 px-4 py-3 text-white">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden="true">
          🎟️
        </span>
        <h1 className="text-base font-bold">Chasseur de Coupons</h1>
      </div>
      <p className="mt-0.5 text-xs text-indigo-200">
        {domain !== null ? (
          <>
            Site actif : <span className="font-semibold text-white">{domain}</span>
          </>
        ) : (
          'Aucune boutique détectée dans cet onglet'
        )}
      </p>
    </header>
  )
}

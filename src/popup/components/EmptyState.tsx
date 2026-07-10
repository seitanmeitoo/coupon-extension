// État vide de la liste de coupons.

export default function EmptyState({ domain }: { domain: string | null }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <span className="text-3xl" aria-hidden="true">
        🏷️
      </span>
      <p className="text-sm font-medium text-gray-700">Aucun coupon trouvé pour ce site</p>
      <p className="px-6 text-xs text-gray-500">
        {domain !== null
          ? `Nous n'avons encore aucun code pour « ${domain} ». Si vous en découvrez un qui fonctionne, il sera proposé au partage communautaire (si vous l'avez activé).`
          : 'Ouvrez une boutique en ligne puis cliquez sur l’icône de l’extension.'}
      </p>
    </div>
  )
}

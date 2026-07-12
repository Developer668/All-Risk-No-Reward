export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`logo ${light ? 'logo--light' : ''}`} aria-label="All Risk, No Reward">
      <span className="logo__mark" aria-hidden="true"><img src="/logo.png" alt="" /></span>
      <span>ALL RISK<br /><em>NO REWARD</em></span>
    </div>
  )
}

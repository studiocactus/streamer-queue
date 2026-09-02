import { Link } from 'react-router-dom'
import { Tv2, Heart } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-secondary mt-auto">
      <div className="app-shell py-10 lg:py-14">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-brand-purple rounded-lg flex items-center justify-center">
                <Tv2 size={15} className="text-white" />
              </div>
              <span className="font-bold text-base text-content-primary">
                Watch<span className="text-brand-purple">Queue</span>
              </span>
            </Link>
            <p className="text-sm text-content-secondary max-w-xs">
              Plataforma onde a comunidade escolhe o que o streamer assiste.
              Organize sua fila, receba sugestões e engaje sua audiência.
            </p>
          </div>

          {/* Produto */}
          <div>
            <h3 className="text-sm font-semibold text-content-primary mb-3">Produto</h3>
            <ul className="space-y-2">
              <li>
                <Link to="/explore" className="text-sm text-content-secondary hover:text-content-primary transition-colors">
                  Explorar Streamers
                </Link>
              </li>
              <li>
                <Link to="/dashboard" className="text-sm text-content-secondary hover:text-content-primary transition-colors">
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Recursos */}
          <div>
            <h3 className="text-sm font-semibold text-content-primary mb-3">Recursos</h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://twitch.tv"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-content-secondary hover:text-content-primary transition-colors"
                >
                  Twitch
                </a>
              </li>
              <li>
                <a
                  href="https://supabase.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-content-secondary hover:text-content-primary transition-colors"
                >
                  Supabase
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-content-muted flex items-center gap-1">
            Feito com <Heart size={12} className="text-brand-purple fill-brand-purple" /> para a comunidade de streamers
          </p>
          <p className="text-xs text-content-muted">
            © {new Date().getFullYear()} WatchQueue. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}

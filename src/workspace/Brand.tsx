import { Link } from 'react-router-dom';
import logo from '../assets/images/logo.png';

export default function Brand({ to = '/', tagline = 'MAKE YOURSELF AT HOME' }: { to?: string; tagline?: string }) {
  return <Link className="mk-brand" to={to} aria-label="Maoki House">
    <span className="mk-brand-wordmark"><img src={logo} alt="Maoki House" width="1227" height="329" /></span>
    {tagline && <small>{tagline}</small>}
  </Link>;
}

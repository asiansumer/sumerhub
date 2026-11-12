import { SunMark } from './logo';

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="footer-brand"><SunMark size={16} />sumerhub · {new Date().getFullYear()}</span>
      <span>所有工具都在浏览器本地运行</span>
    </footer>
  );
}

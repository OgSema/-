/**
 * Значки нижней панели. Одна сетка 24×24 и заливка currentColor, поэтому
 * подсветка активной вкладки задаётся цветом текста, а не отдельной картинкой.
 */
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">{children}</svg>
)

export const HomeIcon = () => (
  <Icon><path d="M11.3 3.2a1 1 0 0 1 1.4 0l8 7.1a1 1 0 0 1 .3.8V20a1 1 0 0 1-1 1h-4.5a1 1 0 0 1-1-1v-4.2h-3.6V20a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1v-8.9a1 1 0 0 1 .3-.8z" /></Icon>
)

export const CartIcon = () => (
  <Icon>
    <path
      fillRule="evenodd"
      d="M8 7V6.4a4 4 0 0 1 8 0V7h2.6a1 1 0 0 1 1 .93l.83 11.6A2 2 0 0 1 18.44 22H5.56a2 2 0 0 1-2-2.14l.83-11.6A1 1 0 0 1 5.4 7zm2 0h4v-.6a2 2 0 1 0-4 0z"
    />
  </Icon>
)

export const UserIcon = () => (
  <Icon>
    <path d="M12 12.4a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2" />
    <path d="M12 14.2c-4.3 0-7.8 2.4-7.8 5.4 0 .8.6 1.4 1.4 1.4h12.8c.8 0 1.4-.6 1.4-1.4 0-3-3.5-5.4-7.8-5.4" />
  </Icon>
)

export const AdminIcon = () => (
  <Icon>
    <rect x="3.2" y="3.2" width="7.6" height="7.6" rx="2.2" />
    <rect x="13.2" y="3.2" width="7.6" height="7.6" rx="2.2" />
    <rect x="3.2" y="13.2" width="7.6" height="7.6" rx="2.2" />
    <rect x="13.2" y="13.2" width="7.6" height="7.6" rx="2.2" />
  </Icon>
)

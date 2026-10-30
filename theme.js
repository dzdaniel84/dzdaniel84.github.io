(() => {
 const root = document.documentElement;
 const key = 'dz-color-theme';
 let theme = 'dark';
 try { if (localStorage.getItem(key) === 'light') theme = 'light'; } catch {}
 root.dataset.theme = theme;
 const apply = value => {
  root.dataset.theme = value;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = value === 'light' ? '#f5f5f0' : '#0b121a';
 };
 apply(theme);
 const init = () => {
  apply(root.dataset.theme);
  const footer = document.querySelector('footer');
  if (!footer) return;
  const copyright = Array.from(footer.children).find(el => el.textContent.includes('©'));
  if (!copyright) return;
  const controls = document.createElement('div');
  controls.className = 'footer-controls';
  copyright.before(controls);
  controls.append(copyright);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'theme-toggle';
  const refresh = () => {
   const dark = root.dataset.theme !== 'light';
   button.textContent = dark ? '☀ Light mode' : '☾ Dark mode';
   button.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  };
  button.addEventListener('click', () => {
   const value = root.dataset.theme === 'light' ? 'dark' : 'light';
   apply(value);
   try { localStorage.setItem(key, value); } catch {}
   refresh();
  });
  controls.append(button);
  refresh();
  window.addEventListener('storage', e => {
   if (e.key === key) { apply(e.newValue === 'light' ? 'light' : 'dark'); refresh(); }
  });
 };
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
 else init();
})();

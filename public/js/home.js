fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => location.replace(r.ok ? '/dashboard.html' : '/login.html')).catch(() => location.replace('/login.html'));

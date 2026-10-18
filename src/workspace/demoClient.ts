export const demoEnabled = import.meta.env.DEV && import.meta.env.VITE_LOCAL_DEMO === 'true';
export async function getDemoAuth() {
  if (!demoEnabled) throw new Error('Demo chỉ mở trong môi trường phát triển riêng');
  const { auth } = await import('../config/firebase');
  if (auth.emulatorConfig?.host !== '127.0.0.1') throw new Error('Demo yêu cầu Auth Emulator tại loopback');
  return auth;
}
export async function demoToken() {
  const auth = await getDemoAuth();
  if (!auth.currentUser) throw new Error('Phiên demo đã hết hạn');
  return auth.currentUser.getIdToken();
}

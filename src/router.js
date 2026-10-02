import { createRouter, createWebHistory } from 'vue-router'
import HomeView from './views/HomeView.vue'
import SendView from './views/SendView.vue'
import ScanView from './views/ScanView.vue'
import SettingsView from './views/SettingsView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/send', name: 'send', component: SendView },
    { path: '/scan', name: 'scan', component: ScanView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
})

export default router

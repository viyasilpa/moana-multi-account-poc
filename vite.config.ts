import { defineConfig } from 'vite'
export default defineConfig({optimizeDeps:{exclude:['@electric-sql/pglite']},build:{rolldownOptions:{input:{app:'index.html',acceptance:'acceptance.html',device:'device.html'}}}})

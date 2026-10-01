<template>
  <main class="page home">
    <h1 class="brand">QR Transfer</h1>
    <p class="lede">
      Передайте текст с одного смартфона на другой через QR на экране.
      Отправитель крутит кадры раз в секунду — приёмник читает камерой.
    </p>
    <div class="stack">
      <router-link class="btn btn-primary" :to="{ name: 'send' }">
        Показать QR
      </router-link>
      <router-link class="btn" :to="{ name: 'scan' }">
        Считать камерой
      </router-link>
    </div>
  </main>
</template>

<style scoped>
.home {
  justify-content: center;
  gap: 20px;
}

.brand {
  margin: 0;
  font-size: 2.2rem;
}

.btn {
  text-align: center;
  display: block;
}
</style>

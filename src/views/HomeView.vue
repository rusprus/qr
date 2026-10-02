<template>
  <main class="page home">
    <h1 class="brand">QR Transfer</h1>
    <p class="lede">
      Передайте текст, файл или голос с одного смартфона на другой через QR.
      Отправитель крутит кадры — приёмник читает камерой.
    </p>
    <div class="stack">
      <router-link class="btn btn-primary" :to="{ name: 'send' }">
        Передать
      </router-link>
      <router-link class="btn" :to="{ name: 'scan' }">
        Принять
      </router-link>
      <router-link class="btn btn-ghost" :to="{ name: 'settings' }">
        Настройки скорости
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

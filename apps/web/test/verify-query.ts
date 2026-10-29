import assert from 'node:assert';
import { queryClient } from '../src/lib/query-client';

async function testQuerySetup() {
  console.log('🧪 Iniciando testes de validação do TanStack Query...');

  // 1. Validar instância do queryClient
  console.log('1. Validando queryClient...');
  assert.ok(queryClient, 'queryClient deve estar instanciado');
  const defaultOptions = queryClient.getDefaultOptions();
  assert.ok(defaultOptions.queries, 'Queries devem possuir defaultOptions configuradas');
  assert.strictEqual(defaultOptions.queries?.refetchOnWindowFocus, false, 'refetchOnWindowFocus deve ser false');
  console.log('✅ queryClient configurado corretamente!');

  console.log('\n🎉 TESTES DE QUERY PASSARAM COM SUCESSO!\n');
}

testQuerySetup().catch((err) => {
  console.error('❌ Falha nos testes de query:', err);
  process.exit(1);
});

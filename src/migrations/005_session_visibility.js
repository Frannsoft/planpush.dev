// Session visibility: private plans visible only to owner + admins

export async function up(knex) {
  if (!(await knex.schema.hasColumn('sessions', 'published_at'))) {
    await knex.schema.table('sessions', (t) => {
      t.timestamp('published_at', { useTz: false });
    });
    // All existing sessions are considered published
    await knex('sessions').whereNull('published_at').update({
      published_at: knex.fn.now(),
    });
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('sessions', 'published_at')) {
    await knex.schema.table('sessions', (t) => {
      t.dropColumn('published_at');
    });
  }
}

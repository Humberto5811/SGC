import { describe, it, expect, beforeEach } from 'vitest';
import { state } from '../../src/state.js';

describe('state', () => {
  beforeEach(() => {
    state.currentUser = null;
  });

  it('starts with null currentUser', () => {
    expect(state.currentUser).toBeNull();
    expect(state.getCurrentUser()).toBeNull();
  });

  it('setCurrentUser updates currentUser', () => {
    const user = { dni: 'admin', rol: 'admin' };
    state.setCurrentUser(user);
    expect(state.currentUser).toEqual(user);
    expect(state.getCurrentUser()).toEqual(user);
  });

  it('setCurrentUser can clear the user', () => {
    state.setCurrentUser({ dni: 'x' });
    state.setCurrentUser(null);
    expect(state.getCurrentUser()).toBeNull();
  });
});

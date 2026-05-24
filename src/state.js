export const state = {
  currentUser: null,
  setCurrentUser: (user) => { state.currentUser = user; },
  getCurrentUser: () => state.currentUser
};
const subscribers = [];

const state = {
  data: {
    currentUser: null,
    users: [],
    requerimientos: [],
    contrataciones: [],
  },
  get(key) {
    return this.data[key];
  },
  set(key, value) {
    this.data[key] = value;
    subscribers.forEach((callback) => callback(key, value));
  },
  subscribe(callback) {
    subscribers.push(callback);
    return () => {
      const index = subscribers.indexOf(callback);
      if (index >= 0) subscribers.splice(index, 1);
    };
  },
};

export { state };

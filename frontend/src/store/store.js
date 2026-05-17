import { createStore, combineReducers } from "redux";

const initialReducer = (state = {}, action) => state;
const rootReducer = combineReducers({ app: initialReducer });

const store = createStore(rootReducer);

export default store;

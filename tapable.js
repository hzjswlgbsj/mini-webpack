import { SyncHook, AsyncParallelHook } from "tapable";

class List {
  getRoutes() {}
}
class Car {
  constructor() {
    this.hooks = {
      accelerate: new SyncHook(["newSpeed"]),
      brake: new SyncHook(),
      calculateRoutes: new AsyncParallelHook([
        "source",
        "target",
        "routesList",
      ]),
    };
  }

  setSpeed(newSpeed) {
    // following call returns undefined even when you returned values
    // 触发事件
    this.hooks.accelerate.call(newSpeed);
  }

  useNavigationSystemPromise(source, target) {
    const routesList = new List();
    return this.hooks.calculateRoutes
      .promise(source, target, routesList)
      .then((res) => {
        // res is undefined for AsyncParallelHook
        return routesList.getRoutes();
      });
  }

  useNavigationSystemAsync(source, target, callback) {
    const routesList = new List();
    this.hooks.calculateRoutes.callAsync(source, target, routesList, (err) => {
      if (err) return callback(err);
      callback(null, routesList.getRoutes());
    });
  }
}
// -----------同步事件start-------------
// 事件注册

const car = new Car();
car.hooks.accelerate.tap("test1", (speed) => {
  console.log("accelerate", speed);
});

// 事件触发
car.setSpeed(1);
// -----------同步事件end-------------

// -----------异步事件start-------------
// 事件注册
car.hooks.calculateRoutes.tapPromise("test promise", (source, target) => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      console.log("promise----------", source, target);
      resolve();
    }, 0);
  });
});

// 事件触发
car.useNavigationSystemPromise(["1", "2"], 4);
// -----------异步事件end-------------

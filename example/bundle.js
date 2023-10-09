(function (modules) {
  /**
   * 通过 filePath 找到对应的模块，在这里就是找到包裹代码的函数
   * require 的作用就是帮你去调用导出模块的export函数
   * @param {number} id
   * @returns module.exports
   */
  function require(id) {
    // 简单理解就是 filePath 映射了一个函数名
    // 拿到模块函数，并执行
    const [fn, mapping] = modules[id];

    // 构建 module
    const module = {
      exports: { fn },
    };

    function localRequire(filePath) {
      const id = mapping[filePath];
      return require(id);
    }

    fn(localRequire, module, module.exports);

    // require 函数应该返回的就是
    // module.exports = {
    //   foo,
    // };
    return module.exports;
  }

  require(1); // 先加载入口文件
})({
  1: [
    function (require, module, exports) {
      // main.js
      const { foo } = require("./foo.js");
      foo();
      console.log("main.js");
    },
    {
      "./foo.js": 2,
    },
  ],
  2: [
    function (require, module, exports) {
      // foo.js
      // const bar = require("./bar.js");
      function foo() {
        // bar();
        console.log("foo");
      }
      module.exports = {
        foo,
      };
    },
    {},
  ],
});

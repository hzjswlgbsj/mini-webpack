export class ChangeOutputPath {
  apply(hooks) {
    // 注册事件
    hooks.emitFile.tap("changeOutputPath", (context) => {
      // 这里只是方便演示，从context直接调用方法就完事了，看起来好像多此一举，实际上在这里我们还可以继续做处理
      // 这里只是演示可以拿到打包程序运行时的一些属性和方法
      context.changeOutputPath("./dist/sixty.js");
    });
  }
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createBannerReadService } = require('../src/services/bannerService');
const { createBlogReadService } = require('../src/services/blogService');

const version = 'a'.repeat(64);
const image = Buffer.from(`data:image/jpeg;base64,${'x'.repeat(1024 * 1024)}`);
const project = (row, attributes) => attributes
    ? Object.fromEntries(attributes.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))
    : { ...row };

test('banner collections return versioned media URLs without fetching image blobs, preserving filtering and pagination', async () => {
    let options;
    const read = createBannerReadService({ Banner: {
        async findAndCountAll(query) {
            options = query;
            assert.ok(!query.attributes.includes('image'));
            return { rows: [project({ id: 7, name: 'Hè', description: 'Ưu đãi', imageVersion: version, image }, query.attributes)], count: 12 };
        },
    } });
    const result = await read.getAllBanner({ limit: 6, offset: 6, keyword: ' Hè ' });
    assert.equal(result.count, 12);
    assert.equal(options.limit, 6);
    assert.equal(options.offset, 6);
    assert.equal(options.where.statusId, 'S1');
    assert.equal(options.where.name[Op.substring], 'Hè');
    assert.equal(result.data[0].image, `/api/media/banner-images/7/${version}/banner`);
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 600);
});

function blogFixture() {
    const calls = { list: [], authors: [], comments: [], increments: [] };
    const rows = Array.from({ length: 20 }, (_, index) => ({
        id: index + 1, userId: index % 2 ? 30 : 40, title: `Bài ${index + 1}`, shortdescription: 'Mô tả',
        statusId: 'S1', imageVersion: version, image, contentHTML: '<p>Nội dung</p>', contentMarkdown: 'Nội dung', view: 3,
    }));
    const database = {
        Allcode: {},
        Blog: {
            async findAll(options) { calls.list.push(options); return rows.slice(0, options.limit).map(row => project(row, options.attributes)); },
            async findAndCountAll(options) { calls.list.push(options); return { rows: rows.slice(options.offset || 0, (options.offset || 0) + (options.limit || rows.length)).map(row => project(row, options.attributes)), count: rows.length }; },
            async findOne(options) {
                calls.list.push(options);
                const row = rows.find(item => String(item.id) === String(options.where.id));
                if (!row || (options.where.statusId && row.statusId !== options.where.statusId)) return null;
                return project(row, options.attributes);
            },
            async increment(field, options) { calls.increments.push({ field, options }); },
        },
        User: {
            async findAll(options) {
                calls.authors.push(options);
                assert.deepEqual(options.attributes, ['id', 'firstName', 'lastName']);
                return [{ id: 30, firstName: 'An', lastName: 'Nguyễn' }, { id: 40, firstName: 'Bình', lastName: 'Trần' }];
            },
            async findOne(options) {
                assert.deepEqual(options.attributes, ['id', 'firstName', 'lastName']);
                return { id: 40, firstName: 'Bình', lastName: 'Trần' };
            },
        },
        Comment: {
            async findAll(options) {
                calls.comments.push(options);
                assert.deepEqual(options.attributes, ['id', 'blogId']);
                return [{ id: 100, blogId: 1 }, { id: 101, blogId: 1 }, { id: 102, blogId: 2 }];
            },
        },
    };
    return { read: createBlogReadService(database), calls, rows };
}

test('blog cards batch related data once for 20 rows and preserve author names and comment counts without article bodies', async () => {
    const { read, calls } = blogFixture();
    const result = await read.getAllBlog({ limit: 20, offset: 0, subjectId: 'fashion', keyword: ' Bài ' });
    assert.equal(result.count, 20);
    assert.equal(result.data.length, 20);
    assert.equal(calls.authors.length, 1);
    assert.equal(calls.comments.length, 1);
    assert.deepEqual(new Set(calls.authors[0].where.id[Op.in]), new Set([30, 40]));
    assert.equal(result.data[0].commentData.length, 2);
    assert.equal(result.data[1].commentData.length, 1);
    assert.equal(result.data[2].commentData.length, 0);
    assert.equal(result.data[0].userData.firstName, 'Bình');
    assert.equal(result.data[0].image, `/api/media/blog-images/1/${version}/card`);
    assert.ok(!('contentHTML' in result.data[0]) && !('contentMarkdown' in result.data[0]));
    assert.ok(!calls.list[0].attributes.includes('image'));
    assert.equal(calls.list[0].where.subjectId, 'fashion');
    assert.equal(calls.list[0].where.title[Op.substring], 'Bài');
    assert.ok(Buffer.byteLength(JSON.stringify(result)) < 10000);
});

test('new and featured blog collections keep their ordering and bounded limits with lightweight cards', async () => {
    const { read, calls } = blogFixture();
    await read.getNewBlog({ limit: 3 });
    await read.getFeatureBlog({ limit: 10000 });
    assert.deepEqual(calls.list[0].order, [['createdAt', 'DESC'], ['id', 'DESC']]);
    assert.equal(calls.list[0].limit, 3);
    assert.deepEqual(calls.list[1].order, [['view', 'DESC'], ['id', 'DESC']]);
    assert.equal(calls.list[1].limit, 100);
    assert.ok(calls.list.every(options => !options.attributes.includes('contentHTML')));
});

test('public blog details use a media URL while authenticated editors retain the original image and Markdown for saving', async () => {
    const { read, calls } = blogFixture();
    const publicResult = await read.getDetailBlogById(1, { roleId: 'R2' });
    assert.equal(publicResult.data.image, `/api/media/blog-images/1/${version}/detail`);
    assert.equal(publicResult.data.contentHTML, '<p>Nội dung</p>');
    assert.ok(!('contentMarkdown' in publicResult.data));
    assert.equal(publicResult.data.view, 4);
    assert.equal(calls.increments.length, 1);
    assert.deepEqual(calls.list[0].where, { id: 1, statusId: 'S1' });
    const editorResult = await read.getDetailBlogById(1, { roleId: 'R1' });
    assert.equal(editorResult.data.image, image.toString('utf8'));
    assert.equal(editorResult.data.contentMarkdown, 'Nội dung');
    assert.equal(editorResult.data.contentHTML, '<p>Nội dung</p>');
    assert.equal(calls.increments.length, 1);
});

test('unpublished articles are unavailable publicly but remain editable; missing details return a normal not-found result', async () => {
    const { read, rows } = blogFixture();
    rows[0].statusId = 'S2';
    assert.equal((await read.getDetailBlogById(1)).errCode, 2);
    assert.equal((await read.getDetailBlogById(1, { roleId: 'R4' })).errCode, 0);
    assert.equal((await read.getDetailBlogById(999)).errCode, 2);
});
